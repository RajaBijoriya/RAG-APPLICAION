import { GoogleGenerativeAI } from "@google/generative-ai"
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { message } = req.body
  if (!message) {
    return res.status(400).json({ error: 'No message provided.' })
  }

  try {
    const vectorStore = await getVectorStore()
    const retriever = vectorStore.asRetriever({ k: 5 })
    const relevantDocs = await retriever.invoke(message)
    
    console.log(`Found ${relevantDocs.length} relevant documents for query: "${message}"`)
    
    if (relevantDocs.length === 0) {
      return res.json({ 
        reply: "I don't have any relevant information to answer your question. Please make sure you've uploaded documents to the RAG store first." 
      })
    }

    const context = relevantDocs
      .map((d, i) => {
        const source = d.metadata?.source || 'Unknown source'
        const page = d.metadata?.loc?.pageNumber ?? d.metadata?.page ?? ""
        return `Document ${i + 1} (${source}${page ? `, page ${page}` : ""}):\n${d.pageContent}`
      })
      .join("\n\n")
        
    console.log(`Context length: ${context.length} characters`)

    const systemPrompt = `
You are an AI assistant. Answer the user's question strictly using the provided context from uploaded documents.
If the answer is not present in the context, say you don't have enough information.
Always cite which document(s) you're referencing in your answer.

Context from uploaded documents:
${context}
`.trim()

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
    const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const prompt = `${systemPrompt}\n\nUser question:\n${message}`
    const result = await chatModel.generateContent(prompt)
    const reply = result.response.text()

    res.json({ reply })
  } catch (error) {
    console.error('Error handling chat message:', error)
    res.status(500).json({ error: 'Failed to get a chat reply.' })
  }
}
