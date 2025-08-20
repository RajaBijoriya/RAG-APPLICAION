import axios from 'axios'
import * as cheerio from 'cheerio'
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

// Helper function to scrape website
async function scrapeWebsite(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const $ = cheerio.load(response.data)
    
    // Remove script and style elements
    $('script, style, nav, footer, header').remove()
    
    // Extract text content
    const textContent = $('body').text().replace(/\s+/g, ' ').trim()
    
    return [{
      pageContent: textContent,
      metadata: { source: url, type: 'website' }
    }]
  } catch (error) {
    throw new Error(`Failed to scrape website: ${error.message}`)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'No URL provided.' })
  }

  try {
    // Add timeout for Vercel
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout. Please try again.' })
      }
    }, 25000)

    console.log(`Scraping URL: ${url}`)
    
    const docs = await scrapeWebsite(url)
    
    if (docs.length === 0) {
      clearTimeout(timeout)
      return res.status(400).json({ error: 'No content found at the provided URL.' })
    }

    // Split the documents into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({ 
      chunkSize: 1000, 
      chunkOverlap: 200 
    })
    const splits = await textSplitter.splitDocuments(docs)
    
    console.log(`Split website content into ${splits.length} chunks`)

    // Get existing vector store and add documents
    const vectorStore = await getVectorStore()
    await vectorStore.addDocuments(splits)
    
    console.log(`Added ${splits.length} chunks from website to vector store`)

    clearTimeout(timeout)
    res.json({ 
      message: `Website content from '${url}' scraped and indexed successfully.`,
      chunks: splits.length
    })
  } catch (error) {
    console.error('Error scraping website:', error)
    if (!res.headersSent) {
      res.status(500).json({ 
        error: `Failed to scrape website: ${error.message}`,
        details: error.message 
      })
    }
  }
}

export const config = {
  maxDuration: 30,
}
