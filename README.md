
# Project Sentry – Backend API Documentation



## Overview
Project Sentry is a backend system for automated inventory replenishment, built with Node.js, Express, MongoDB Atlas, and Confluent Cloud Kafka.  It provides RESTful API endpoints for managing low stock alerts, transfer orders, shipments, and receipts, with event-driven orchestration using Kafka topics.




## Getting Started



## Prerequisites
- Node.js (v18+)
- MongoDB Atlas cluster
- Confluent Cloud Kafka cluster
- `.env` file with your credentials




## Setup
1. Clone the repository and install dependencies:
    ```
    npm install
    ```
2. Create a `.env` file in the root directory with the following content:
    ```
    PORT=3000
    MONGODB_URI=your_mongodb_atlas_uri
    KAFKA_BROKERS=your_kafka_bootstrap_server
    KAFKA_USERNAME=your_kafka_api_key
    KAFKA_PASSWORD=your_kafka_api_secret
    DEFAULT_WAREHOUSE_ID=WH1
    ```
3. Start the backend:
    ```
    npm run dev
    ```



## API Endpoints



## 1. Raise Low Stock Alert
- **POST** `/api/alerts`
- **Body:**
    ```
    {
      "store_id": "S1",
      "product_id": "P1",
      "requested_qty": 10
    }
    ```
- **Response:**
    ```
    {
      "replenishment_id": "REP-xxxx",
      "status": "ALERT_RAISED"
    }
    ```




## 2. Create Transfer Order
- **POST** `/api/transfer-orders`
- **Body:**
    ```
    {
      "replenishment_id": "REP-xxxx",
      "quantity": 10,
      "warehouse_id": "WH1"
    }
    ```
- **Response:** Transfer order details and updated status.




## 3. Update Shipment Status
- **PATCH** `/api/shipments/:replenishment_id/ship`
- **Body:**
    ```
    {
      "carrier": "DHL"
    }
    ```
- **Response:** Shipment tracking info and status.




## 4. Mark as Received
- **PATCH** `/api/receipts/:replenishment_id/receive`
- **Response:** Final status and received quantity.




## 5. Get Replenishment Details
- **GET** `/api/replenishments/:replenishment_id`
- **Response:** Full order details and history.




## 6. List All Replenishments
- **GET** `/api/replenishments`
- **Response:** Array of all replenishment orders.





## Example Workflow

1. **Raise alert:**  
   POST `/api/alerts` → get `replenishment_id`

2. **Create transfer order:**  
   POST `/api/transfer-orders` with `replenishment_id`

3. **Update shipment:**  
   PATCH `/api/shipments/{replenishment_id}/ship`

4. **Mark as received:**  
   PATCH `/api/receipts/{replenishment_id}/receive`

5. **Check status:**  
   GET `/api/replenishments/{replenishment_id}`




## Error Handling
- 400: Bad request (missing/invalid fields)
- 404: Not found (invalid `replenishment_id`)
- 409: Conflict (insufficient stock)
- 500: Internal server error





## Technologies Used
- Node.js, Express
- MongoDB Atlas (Mongoose)
- Confluent Cloud Kafka (kafkajs)
- Postman (for API testing)





## How to Test
- Use Postman or curl to send requests to `http://localhost:3000`
- Example curl:
    ```
    curl -X POST http://localhost:3000/api/alerts -H "Content-Type: application/json" -d "{\"store_id\":\"S1\",\"product_id\":\"P1\",\"requested_qty\":10}"
    ```



## Notes
- All business logic and orchestration are handled in the backend.
- No frontend is required for this project; all features are accessible via API.
