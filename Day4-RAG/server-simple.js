console.log('--- Server script starting ---');
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the Day4-RAG directory
dotenv.config({ path: path.join(__dirname, '.env') });
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import axios from 'axios';
import * as cheerio from 'cheerio';
// Using LangChain's PDF loader instead of pdf-parse

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

// Set Content Security Policy headers
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com data:; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self'"
    );
    next();
});

app.use(express.static(path.join(__dirname)));

// Add logging for debugging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Serve static files with correct MIME types
app.use('/Day4-RAG', express.static(path.join(__dirname), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
    try {
        // Try to connect to existing collection
        const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, qdrantConfig);
        console.log('Connected to existing Qdrant collection');
        return vectorStore;
    } catch (error) {
        console.log('Collection does not exist, creating new one...');
        // Create new collection if it doesn't exist
        const vectorStore = await QdrantVectorStore.fromDocuments(
            [], // Empty documents to create collection
            embeddings,
            qdrantConfig
        );
        console.log('Created new Qdrant collection');
        return vectorStore;
    }
}

// Helper function to process PDF files using LangChain WebPDFLoader
async function processPDF(buffer, filename) {
    try {
        console.log(`Processing PDF: ${filename}`);
        
        // Create a blob from the buffer
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const file = new File([blob], filename, { type: 'application/pdf' });
        
        // Use LangChain's WebPDFLoader
        const { WebPDFLoader } = await import('@langchain/community/document_loaders/web/pdf');
        const loader = new WebPDFLoader(file);
        const docs = await loader.load();
        
        if (!docs || docs.length === 0) {
            return [{
                pageContent: `PDF file "${filename}" was processed but contains no extractable text. It may be an image-based PDF or contain only graphics.`,
                metadata: { 
                    source: filename, 
                    type: 'pdf',
                    note: 'No text content found'
                }
            }];
        }
        
        console.log(`Successfully extracted text from ${docs.length} pages`);
        
        // Combine all pages into a single document
        const fullText = docs.map((doc, index) => 
            `Page ${index + 1}:\n${doc.pageContent}`
        ).join('\n\n');
        
        return [{
            pageContent: fullText.trim(),
            metadata: { 
                source: filename, 
                type: 'pdf', 
                pages: docs.length,
                extractedAt: new Date().toISOString()
            }
        }];
        
    } catch (error) {
        console.error(`Error processing PDF ${filename}:`, error);
        
        // Fallback: Create a helpful message for manual extraction
        return [{
            pageContent: `PDF file "${filename}" has been uploaded but automatic text extraction failed. 

To use this PDF content:
1. Open the PDF in a PDF reader
2. Select all text (Ctrl+A) and copy it (Ctrl+C)
3. Paste the text in the "Text Input" section below
4. Click "Add Text" to add it to the knowledge base

Error details: ${error.message}`,
            metadata: { 
                source: filename, 
                type: 'pdf',
                error: error.message,
                note: 'Manual extraction required'
            }
        }];
    }
}

// Helper function to process text/CSV files
function processTextFile(buffer, filename) {
    const content = buffer.toString('utf-8');
    return [{
        pageContent: content,
        metadata: { source: filename }
    }];
}

// Helper function to scrape website
async function scrapeWebsite(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Remove script and style elements
        $('script, style, nav, footer, header').remove();
        
        // Extract text content
        const textContent = $('body').text().replace(/\s+/g, ' ').trim();
        
        return [{
            pageContent: textContent,
            metadata: { source: url, type: 'website' }
        }];
    } catch (error) {
        throw new Error(`Failed to scrape website: ${error.message}`);
    }
}

// Endpoint to handle file uploads and indexing
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        const { buffer, mimetype, originalname } = req.file;
        console.log(`Received file: ${originalname}, type: ${mimetype}`);

        let docs;
        
        if (mimetype === 'application/pdf') {
            docs = await processPDF(buffer, originalname);
        } else if (mimetype === 'text/plain' || mimetype === 'text/csv') {
            docs = processTextFile(buffer, originalname);
        } else {
            return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
        }

        const textSplitter = new RecursiveCharacterTextSplitter({ 
            chunkSize: 1000, 
            chunkOverlap: 200 
        });
        const splits = await textSplitter.splitDocuments(docs);
        
        console.log(`Split into ${splits.length} chunks`);

        // Get existing vector store and add documents
        const vectorStore = await getVectorStore();
        await vectorStore.addDocuments(splits);
        
        console.log(`Added ${splits.length} chunks to vector store`);

        res.json({ 
            message: `File '${originalname}' uploaded and processed successfully.`,
            chunks: splits.length
        });
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
        
        const docs = await scrapeWebsite(url);
        
        if (docs.length === 0) {
            return res.status(400).json({ error: 'No content found at the provided URL.' });
        }

        // Split the documents into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({ 
            chunkSize: 1000, 
            chunkOverlap: 200 
        });
        const splits = await textSplitter.splitDocuments(docs);
        
        console.log(`Split website content into ${splits.length} chunks`);

        // Get existing vector store and add documents
        const vectorStore = await getVectorStore();
        await vectorStore.addDocuments(splits);
        
        console.log(`Added ${splits.length} chunks from website to vector store`);

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
        
        console.log(`Split text input into ${splits.length} chunks`);

        // Get existing vector store and add documents
        const vectorStore = await getVectorStore();
        await vectorStore.addDocuments(splits);
        
        console.log(`Added ${splits.length} chunks from text input to vector store`);

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
        // Delete the existing collection and recreate it
        const response = await fetch(`${qdrantConfig.url}/collections/${qdrantConfig.collectionName}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 404) {
            // Collection deleted or didn't exist, now recreate it
            const createResponse = await fetch(`${qdrantConfig.url}/collections/${qdrantConfig.collectionName}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    vectors: {
                        size: 768, // Google text-embedding-004 dimension
                        distance: "Cosine"
                    }
                })
            });
            
            if (createResponse.ok) {
                res.json({ message: 'Store cleared and recreated successfully.' });
            } else {
                throw new Error('Failed to recreate collection');
            }
        } else {
            throw new Error('Failed to delete collection');
        }
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
        const retriever = vectorStore.asRetriever({ k: 5 });
        const relevantDocs = await retriever.invoke(message);
        
        console.log(`Found ${relevantDocs.length} relevant documents for query: "${message}"`);
        
        if (relevantDocs.length === 0) {
            return res.json({ 
                reply: "I don't have any relevant information to answer your question. Please make sure you've uploaded documents to the RAG store first." 
            });
        }

        const context = relevantDocs
            .map((d, i) => {
                const source = d.metadata?.source || 'Unknown source';
                const page = d.metadata?.loc?.pageNumber ?? d.metadata?.page ?? "";
                return `Document ${i + 1} (${source}${page ? `, page ${page}` : ""}):\n${d.pageContent}`;
            })
            .join("\n\n");
            
        console.log(`Context length: ${context.length} characters`);

        const systemPrompt = `
    You are an AI assistant. Answer the user's question strictly using the provided context from uploaded documents.
    If the answer is not present in the context, say you don't have enough information.
    Always cite which document(s) you're referencing in your answer.
    
    Context from uploaded documents:
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
