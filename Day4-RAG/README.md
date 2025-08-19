# RAG (Retrieval-Augmented Generation) Application

This is a full-stack RAG application that allows you to chat with your documents. You can upload PDF, TXT, or CSV files, which are then indexed into a vector database. The chat interface uses this database to provide contextually relevant answers to your questions.

## Features

- **File Upload**: Supports PDF, TXT, and CSV files.
- **Vector Indexing**: Uses Google's Gemini embeddings and Qdrant for vector storage.
- **Chat Interface**: A simple and intuitive UI to interact with your documents.
- **Backend API**: Built with Express.js to handle file processing and chat logic.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Docker](https://www.docker.com/products/docker-desktop/)

## Setup and Installation

1.  **Install Dependencies**:
    Open your terminal in the project's root directory and run:
    ```bash
    npm install
    ```

2.  **Set Up Environment Variables**:
    Create a `.env` file in the `Day4-RAG` directory by copying the example file:
    ```bash
    cp .env.example .env
    ```
    Open the new `.env` file and add your Google AI Studio API key:
    ```
    GOOGLE_API_KEY="YOUR_API_KEY_HERE"
    ```

3.  **Start the Qdrant Vector Database**:
    Make sure Docker is running on your machine. Then, in the `Day4-RAG` directory, run:
    ```bash
    docker-compose up -d
    ```
    This will start the Qdrant container in the background.

## Running the Application

Once the setup is complete, you can start the backend server:

```bash
npm start
```

The server will be running at `http://localhost:3000`. You can open the `index.html` file in your browser to use the application.

## How to Use

1.  **Upload a Document**: Use the file upload form to select a PDF, TXT, or CSV file.
2.  **Wait for Indexing**: The file will be processed and indexed. You'll see a success message when it's done.
3.  **Start Chatting**: Type your questions into the chat window and get answers based on the document's content.

## API Endpoints

- `POST /api/upload`: Handles file uploads for indexing.
- `POST /api/chat`: Manages chat messages and retrieves answers.
- `POST /api/scrape`: (Not Implemented) Placeholder for web scraping functionality.
