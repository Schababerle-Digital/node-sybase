# Sybase Node.js Bridge (ServiceName Fix)

## Overview

This library provides a Node.js bridge to connect to a Sybase database. It uses a Java bridge to facilitate the connection and query execution.

**🔧 Fixed Issue:** This fork resolves the ServiceName parameter being ignored in JDBC connection strings, ensuring you connect to the correct database instead of the server's default database.

## Installation

```bash
npm install schababerledigital/nodejs-sybase
```

## Original package

https://www.npmjs.com/package/@soinlabs/sybase

## Changes from Original

- ✅ Fixed JDBC URL to use `?ServiceName=database` format
- ✅ Added database connection verification
- ✅ Updated for jconn4.jar compatibility
- ✅ Added debug logging for connection troubleshooting
- ✅ Improved error handling for connection failures

## License

MIT License