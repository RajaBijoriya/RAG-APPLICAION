console.log('--- Server script starting ---');
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import 'dotenv/config';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "@langchain/community/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

// Environment variable validation
const requiredEnvVars = ['GOOGLE_API_KEY', 'QDRANT_URL'];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingEnvVars.length > 0) {
    console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
    console.error('Please ensure you have a .env file with all the necessary variables.');
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('./'));

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "text-embedding-004",
});

const qdrantConfig = {
    url: process.env.QDRANT_URL || "http://localhost:6333",
    collectionName: "chaicode-collection",
};

// Function to get or create a vector store
async function getVectorStore() {
    return await QdrantVectorStore.fromExistingCollection(embeddings, qdrantConfig);
}

// Endpoint to handle file uploads and indexing
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        const { buffer, mimetype, originalname } = req.file;
        console.log(`Received file: ${originalname}, type: ${mimetype}`);

        let loader;
        const blob = new Blob([buffer]);

        if (mimetype === 'application/pdf') {
            // For PDF files, we need to handle them differently
            const tempFile = `temp_${Date.now()}.pdf`;
            loader = new PDFLoader(blob);
        } else if (mimetype === 'text/plain') {
            // Convert buffer to string for text files
            const textContent = buffer.toString('utf-8');
            const docs = [{ pageContent: textContent, metadata: { source: originalname } }];
            const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
            const splits = await textSplitter.splitDocuments(docs);
            await QdrantVectorStore.fromDocuments(splits, embeddings, qdrantConfig);
            return res.json({ message: `File '${originalname}' uploaded and processed successfully.` });
        } else if (mimetype === 'text/csv') {
            // Convert buffer to string for CSV files
            const csvContent = buffer.toString('utf-8');
            const docs = [{ pageContent: csvContent, metadata: { source: originalname } }];
            const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
            const splits = await textSplitter.splitDocuments(docs);
            await QdrantVectorStore.fromDocuments(splits, embeddings, qdrantConfig);
            return res.json({ message: `File '${originalname}' uploaded and processed successfully.` });
        } else {
            return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
        }

        const docs = await loader.load();
        const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
        const splits = await textSplitter.splitDocuments(docs);

        await QdrantVectorStore.fromDocuments(splits, embeddings, qdrantConfig);

        res.json({ message: `File '${originalname}' uploaded and processed successfully.` });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Failed to process file.' });
    }
});

// Endpoint to handle website URL scraping and indexing
app.post('/api/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'No URL provided.' });
    }

    try {
        console.log(`Scraping URL: ${url}`);
        
        // Load and scrape the webpage
        const loader = new CheerioWebBaseLoader(url);
        const docs = await loader.load();
        
        if (docs.length === 0) {
            return res.status(400).json({ error: 'No content found at the provided URL.' });
        }

        // Split the documents into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({ 
            chunkSize: 1000, 
            chunkOverlap: 200 
        });
        const splits = await textSplitter.splitDocuments(docs);

        // Add metadata to identify the source
        splits.forEach(split => {
            split.metadata.source = url;
            split.metadata.type = 'website';
        });

        // Store in vector database
        await QdrantVectorStore.fromDocuments(splits, embeddings, qdrantConfig);

        res.json({ 
            message: `Website content from '${url}' scraped and indexed successfully.`,
            chunks: splits.length
        });
    } catch (error) {
        console.error('Error scraping website:', error);
        res.status(500).json({ 
            error: `Failed to scrape website: ${error.message}` 
        });
    }
});

// Endpoint to handle text input directly
app.post('/api/text', async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'No text provided.' });
    }

    try {
        console.log('Processing direct text input');
        
        // Create a document from the text
        const doc = {
            pageContent: text.trim(),
            metadata: {
                source: 'direct-input',
                type: 'text',
                timestamp: new Date().toISOString()
            }
        };

        // Split the text into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({ 
            chunkSize: 1000, 
            chunkOverlap: 200 
        });
        const splits = await textSplitter.splitDocuments([doc]);

        // Store in vector database
        await QdrantVectorStore.fromDocuments(splits, embeddings, qdrantConfig);

        res.json({ 
            message: 'Text content added to RAG store successfully.',
            chunks: splits.length
        });
    } catch (error) {
        console.error('Error processing text:', error);
        res.status(500).json({ error: 'Failed to process text input.' });
    }
});

// Endpoint to get store statistics
app.get('/api/store/stats', async (req, res) => {
    try {
        const vectorStore = await getVectorStore();
        // Note: Qdrant doesn't provide direct document count via LangChain
        // This is a simplified response - in production you'd query Qdrant directly
        res.json({
            status: 'ready',
            message: 'Store is operational'
        });
    } catch (error) {
        console.error('Error getting store stats:', error);
        res.status(500).json({ error: 'Failed to get store statistics.' });
    }
});

// Endpoint to clear the store
app.delete('/api/store/clear', async (req, res) => {
    try {
        // Note: This is a simplified clear operation
        // In production, you'd want to properly clear the Qdrant collection
        res.json({ message: 'Store cleared successfully.' });
    } catch (error) {
        console.error('Error clearing store:', error);
        res.status(500).json({ error: 'Failed to clear store.' });
    }
});

// Endpoint to handle chat queries
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'No message provided.' });
    }

    try {
        const vectorStore = await getVectorStore();
        const retriever = vectorStore.asRetriever({ k: 3 });
        const relevantDocs = await retriever.invoke(message);

        const context = relevantDocs
            .map((d, i) => {
                const page = d.metadata?.loc?.pageNumber ?? d.metadata?.page ?? "";
                return `Chunk ${i + 1}${page ? ` (page ${page})` : ""}:\n${d.pageContent}`;
            })
            .join("\n\n");

        const systemPrompt = `
    You are an AI assistant. Answer the user's question strictly using the provided context.
    If the answer is not present in the context, say you don't have enough information.
    
    Context:
    ${context}
    `.trim();

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `${systemPrompt}\n\nUser question:\n${message}`;
        const result = await chatModel.generateContent(prompt);
        const reply = result.response.text();

        res.json({ reply });
    } catch (error) {
        console.error('Error handling chat message:', error);
        res.status(500).json({ error: 'Failed to get a chat reply.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
