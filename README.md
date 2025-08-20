# RAG Application - Next.js

A Retrieval Augmented Generation (RAG) application built with Next.js that allows you to upload documents, scrape websites, and chat with your data using Google's Gemini AI.

## Features

- **Document Upload**: Support for PDF, CSV, and TXT files
- **Website Scraping**: Extract content from web pages
- **Text Input**: Direct text input for knowledge base
- **AI Chat**: Chat with your documents using Gemini AI
- **Vector Storage**: Powered by Qdrant vector database

## Prerequisites

- Node.js 18+ 
- Qdrant vector database running locally or remotely
- Google AI API key

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   Copy your environment variables to `.env.local`:
   ```
   GOOGLE_API_KEY=your_google_api_key_here
   QDRANT_URL=http://localhost:6333
   ```

3. **Start Qdrant (if running locally):**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. **Add Data Sources:**
   - Upload PDF, CSV, or TXT files
   - Enter text directly
   - Scrape website content

2. **Chat with Your Data:**
   - Ask questions about your uploaded content
   - Get AI-powered responses based on your documents

## API Endpoints

- `POST /api/upload` - Upload files
- `POST /api/text` - Add text content
- `POST /api/scrape` - Scrape website
- `POST /api/chat` - Chat with documents
- `GET /api/store/stats` - Get store status
- `DELETE /api/store/clear` - Clear all data

## Technology Stack

- **Frontend**: Next.js, React
- **Backend**: Next.js API Routes
- **AI**: Google Gemini AI
- **Vector DB**: Qdrant
- **Document Processing**: LangChain

## Migration from Express

This application has been converted from Express.js to Next.js for better performance, SEO, and modern React features.
