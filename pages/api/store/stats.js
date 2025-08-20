import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { QdrantVectorStore } from "@langchain/qdrant"

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const vectorStore = await getVectorStore()
    res.json({
      status: 'ready',
      message: 'Store is operational'
    })
  } catch (error) {
    console.error('Error getting store stats:', error)
    res.status(500).json({ 
      error: 'Failed to get store statistics.',
      details: error.message 
    })
  }
}

export const config = {
  maxDuration: 10,
}
