const qdrantConfig = {
  url: process.env.QDRANT_URL || "http://localhost:6333",
  collectionName: "chaicode_collection",
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Add timeout for Vercel
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout. Please try again.' })
      }
    }, 25000)

    // Delete the existing collection and recreate it
    const response = await fetch(`${qdrantConfig.url}/collections/${qdrantConfig.collectionName}`, {
      method: 'DELETE'
    })
    
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
      })
      
      if (createResponse.ok) {
        clearTimeout(timeout)
        res.json({ message: 'Store cleared and recreated successfully.' })
      } else {
        throw new Error('Failed to recreate collection')
      }
    } else {
      throw new Error('Failed to delete collection')
    }
  } catch (error) {
    console.error('Error clearing store:', error)
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to clear store.',
        details: error.message 
      })
    }
  }
}

export const config = {
  maxDuration: 30,
}
