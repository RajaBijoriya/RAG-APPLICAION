import multer from 'multer'
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

// Configure multer for memory storage with size limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
})

// Middleware to handle multipart/form-data
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result)
      }
      return resolve(result)
    })
  })
}

// Initialize Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "text-embedding-004",
})

const qdrantConfig = {
  url: process.env.QDRANT_URL || "http://localhost:6333",
  collectionName: "chaicode-collection",
}

// Function to get or create a vector store
async function getVectorStore() {
  try {
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, qdrantConfig)
    console.log('Connected to existing Qdrant collection')
    return vectorStore
  } catch (error) {
    console.log('Collection does not exist, creating new one...')
    const vectorStore = await QdrantVectorStore.fromDocuments(
      [],
      embeddings,
      qdrantConfig
    )
    console.log('Created new Qdrant collection')
    return vectorStore
  }
}

// Helper function to process PDF files
async function processPDF(buffer, filename) {
  try {
    console.log(`Processing PDF: ${filename}`)
    
    const blob = new Blob([buffer], { type: 'application/pdf' })
    const file = new File([blob], filename, { type: 'application/pdf' })
    
    const { WebPDFLoader } = await import('@langchain/community/document_loaders/web/pdf')
    const loader = new WebPDFLoader(file)
    const docs = await loader.load()
    
    if (!docs || docs.length === 0) {
      return [{
        pageContent: `PDF file "${filename}" was processed but contains no extractable text. It may be an image-based PDF or contain only graphics.`,
        metadata: { 
          source: filename, 
          type: 'pdf',
          note: 'No text content found'
        }
      }]
    }
    
    console.log(`Successfully extracted text from ${docs.length} pages`)
    
    const fullText = docs.map((doc, index) => 
      `Page ${index + 1}:\n${doc.pageContent}`
    ).join('\n\n')
    
    return [{
      pageContent: fullText.trim(),
      metadata: { 
        source: filename, 
        type: 'pdf', 
        pages: docs.length,
        extractedAt: new Date().toISOString()
      }
    }]
    
  } catch (error) {
    console.error(`Error processing PDF ${filename}:`, error)
    
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
    }]
  }
}

// Helper function to process text/CSV files
function processTextFile(buffer, filename) {
  const content = buffer.toString('utf-8')
  return [{
    pageContent: content,
    metadata: { source: filename }
  }]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Add timeout handling for Vercel
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout. Please try with a smaller file.' })
      }
    }, 55000) // 55 seconds timeout

    // Run multer middleware
    await runMiddleware(req, res, upload.single('file'))

    if (!req.file) {
      clearTimeout(timeout)
      return res.status(400).json({ error: 'No file uploaded.' })
    }

    const { buffer, mimetype, originalname } = req.file
    console.log(`Received file: ${originalname}, type: ${mimetype}`)

    // Check file size for Vercel limits
    if (buffer.length > 10 * 1024 * 1024) {
      clearTimeout(timeout)
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' })
    }

    let docs

    if (mimetype === 'application/pdf') {
      docs = await processPDF(buffer, originalname)
    } else if (mimetype === 'text/plain' || mimetype === 'text/csv') {
      docs = processTextFile(buffer, originalname)
    } else {
      clearTimeout(timeout)
      return res.status(400).json({ error: `Unsupported file type: ${mimetype}` })
    }

    const textSplitter = new RecursiveCharacterTextSplitter({ 
      chunkSize: 1000, 
      chunkOverlap: 200 
    })
    const splits = await textSplitter.splitDocuments(docs)
    
    console.log(`Split into ${splits.length} chunks`)

    const vectorStore = await getVectorStore()
    await vectorStore.addDocuments(splits)
    
    console.log(`Added ${splits.length} chunks to vector store`)

    clearTimeout(timeout)
    res.json({ 
      message: `File '${originalname}' uploaded and processed successfully.`,
      chunks: splits.length
    })
  } catch (error) {
    console.error('Error processing file:', error)
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process file.',
        details: error.message 
      })
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '10mb',
  },
  maxDuration: 60,
}
