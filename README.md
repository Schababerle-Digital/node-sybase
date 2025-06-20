# Sybase Node.js Bridge (ServiceName Fix)

## Overview

This library provides a Node.js bridge to connect to a Sybase database. It uses a Java bridge to facilitate the connection and query execution.

**🔧 Fixed Issue:** This fork resolves the ServiceName parameter being ignored in JDBC connection strings, ensuring you connect to the correct database instead of the server's default database.

## Installation

```bash
npm install schababerledigital/nodejs-sybase
```

## Usage

There are multiple ways to use this package, from the original class-based approach to new simplified functions.

### Configuration

All methods require a configuration object with the following properties:

```javascript
const config = {
  host: 'localhost',          // Database host
  port: '5000',               // Database port
  database: 'mydatabase',     // Database name
  username: 'myuser',         // Database username
  password: 'mypassword',     // Database password
  minConnections: 1,          // Minimum number of connections in the pool (optional)
  maxConnections: 10,         // Maximum number of connections in the pool (optional)
  connectionTimeout: 30000,   // Connection timeout in milliseconds (optional)
  idleTimeout: 60000,         // Idle timeout in milliseconds (optional)
  keepaliveTime: 0,           // Keepalive time in milliseconds (optional)
  maxLifetime: 1800000,       // Maximum lifetime of a connection in milliseconds (optional)
  transactionConnections: 5,  // Number of connections reserved for transactions (optional)
  logs: true                  // Enable logging (optional)
};
```

### Method 1: Using the Sybase class directly (original approach)

```javascript
const Sybase = require('nodejs-sybase');

async function example() {
  // Create a new Sybase instance
  const db = new Sybase(config);

  try {
    // Connect to the database
    await db.connectAsync();

    // Execute a query
    const result = await db.querySync('SELECT * FROM mytable');
    console.log(result);

    // Disconnect from the database
    await db.disconnectSync();
  } catch (error) {
    console.error(error);
    if (db.isConnected()) {
      await db.disconnectSync();
    }
  }
}
```

### Method 2: Using the createConnection function

```javascript
const sybase = require('nodejs-sybase');

async function example() {
  // Create a new connection
  const db = sybase.createConnection(config);

  try {
    // Connect to the database
    await db.connectAsync();

    // Execute a query
    const result = await db.querySync('SELECT * FROM mytable');
    console.log(result);

    // Disconnect from the database
    await db.disconnectSync();
  } catch (error) {
    console.error(error);
    if (db.isConnected()) {
      await db.disconnectSync();
    }
  }
}
```

### Method 3: Using the connect function

```javascript
const sybase = require('nodejs-sybase');

async function example() {
  try {
    // Connect to the database
    const db = await sybase.connect(config);

    // Execute a query
    const result = await db.querySync('SELECT * FROM mytable');
    console.log(result);

    // Disconnect from the database
    await db.disconnectSync();
  } catch (error) {
    console.error(error);
  }
}
```

### Method 4: Using the query function (simplest approach)

```javascript
const sybase = require('nodejs-sybase');

async function example() {
  try {
    // Execute a query (automatically connects and disconnects)
    const result = await sybase.query(config, 'SELECT * FROM mytable');
    console.log(result);
  } catch (error) {
    console.error(error);
  }
}
```

## API Reference

### Sybase Class

The main class for interacting with a Sybase database.

#### Constructor

```javascript
const db = new Sybase(config);
```

#### Methods

- `connect(callback)`: Connects to the database (callback style)
- `connectAsync()`: Connects to the database (Promise style)
- `query(sql, callback)`: Executes a SQL query (callback style)
- `querySync(sql, transactionId, finishTransaction)`: Executes a SQL query (Promise style)
- `transaction(queriesFunction)`: Executes a series of queries within a transaction
- `getVersion()`: Retrieves the version of the Sybase database
- `disconnect()`: Disconnects from the database
- `disconnectSync()`: Disconnects from the database (Promise style)
- `isConnected()`: Checks if the database is connected

### Helper Functions

- `createConnection(config)`: Creates a new Sybase instance
- `connect(config)`: Creates and connects to a Sybase database
- `query(config, sql)`: Executes a query on a new connection and then disconnects

## TypeScript Support

This package includes TypeScript definitions. You can import the types as follows:

```typescript
import Sybase from 'nodejs-sybase';
// or
import { Sybase, createConnection, connect, query } from 'nodejs-sybase';
```

## Original package

https://www.npmjs.com/package/@soinlabs/sybase

## Changes from Original

- ✅ Fixed JDBC URL to use `?ServiceName=database` format
- ✅ Added database connection verification
- ✅ Updated for jconn4.jar compatibility
- ✅ Added debug logging for connection troubleshooting
- ✅ Improved error handling for connection failures
- ✅ Added simplified API for easier usage as an npm package

## License

MIT License
