import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

// Initialize Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "text-embedding-004",
})

const qdrantConfig = {
  url: process.env.QDRANT_URL || "http://localhost:6333",
  collectionName: "chaicode_collection",
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided.' })
  }

  try {
    // Add timeout for Vercel
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout. Please try again.' })
      }
    }, 25000)

    console.log('Processing direct text input')
    
    // Create a document from the text
    const doc = {
      pageContent: text.trim(),
      metadata: {
        source: 'direct-input',
        type: 'text',
        timestamp: new Date().toISOString()
      }
    }

    // Split the text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({ 
      chunkSize: 1000, 
      chunkOverlap: 200 
    })
    const splits = await textSplitter.splitDocuments([doc])
    
    console.log(`Split text input into ${splits.length} chunks`)

    // Get existing vector store and add documents
    const vectorStore = await getVectorStore()
    await vectorStore.addDocuments(splits)
    
    console.log(`Added ${splits.length} chunks from text input to vector store`)

    clearTimeout(timeout)
    res.json({ 
      message: 'Text content added to RAG store successfully.',
      chunks: splits.length
    })
  } catch (error) {
    console.error('Error processing text:', error)
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process text input.',
        details: error.message 
      })
    }
  }
}

export const config = {
  maxDuration: 30,
}
