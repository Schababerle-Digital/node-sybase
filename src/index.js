const spawn = require("child_process").spawn;
const path = require("path");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamValues } = require("stream-json/streamers/StreamValues");

/**
 * Creates a Sybase database connection with the given configuration.
 * 
 * @param {Object} config - Configuration object for the Sybase connection
 * @param {string} config.host - Database host
 * @param {string|number} config.port - Database port
 * @param {string} config.database - Database name
 * @param {string} config.username - Database username
 * @param {string} config.password - Database password
 * @param {number} [config.minConnections=1] - Minimum number of connections in the pool
 * @param {number} [config.maxConnections=1] - Maximum number of connections in the pool
 * @param {number} [config.connectionTimeout=30000] - Connection timeout in milliseconds
 * @param {number} [config.idleTimeout=60000] - Idle timeout in milliseconds
 * @param {number} [config.keepaliveTime=0] - Keepalive time in milliseconds
 * @param {number} [config.maxLifetime=1800000] - Maximum lifetime of a connection in milliseconds
 * @param {number} [config.transactionConnections=5] - Number of connections reserved for transactions
 * @param {boolean} [config.logTiming] - Whether to log timing information
 * @param {string} [config.pathToJavaBridge] - Path to the Java bridge JAR file
 * @param {string} [config.encoding="utf8"] - Character encoding
 * @param {boolean} [config.logs=false] - Whether to enable logging
 * @returns {Sybase} A new Sybase instance
 */
function createConnection(config) {
  return new Sybase(config);
}

/**
 * Sybase database connection class.
 * 
 * @class
 */
function Sybase({
  host,
  port,
  database,
  username,
  password,
  minConnections = 1,
  maxConnections = 1,
  connectionTimeout = 30000,
  idleTimeout = 60000,
  keepaliveTime = 0,
  maxLifetime = 1800000,
  transactionConnections = 5,
  logTiming,
  pathToJavaBridge,
  encoding = "utf8",
  logs = false,
}) {
  this.connected = false;
  this.host = host;
  this.port = port;
  this.database = database;
  this.username = username;
  this.password = password;
  this.minConnections = minConnections;
  this.maxConnections = maxConnections;
  this.connectionTimeout = connectionTimeout;
  this.idleTimeout = idleTimeout;
  this.keepaliveTime = keepaliveTime;
  this.maxLifetime = maxLifetime;
  this.transactionConnections = transactionConnections;
  this.transactionConnections
  this.logTiming = logTiming === true;
  this.encoding = encoding;
  this.logs = logs;

  this.pathToJavaBridge = pathToJavaBridge;

  if (this.pathToJavaBridge === undefined) {
    this.pathToJavaBridge = path.resolve(
      __dirname,
      "..",
      "JavaSybaseLink",
      "dist",
      "JavaSybaseLink.jar"
    );
  }

  this.queryCount = 0;
  this.transactionCount = 0;
  this.currentMessages = {}; // look up msgId to message sent and call back details.

  this.jsonParser = chain([
    parser({ jsonStreaming: true }),
    streamValues(),
    (data) => data.value,
  ]);

  /**
   * Handles the SQL response from the database.
   *
   * @param {Object} jsonMsg - The JSON message received from the database.
   *
   * @example
   * this.onSQLResponse({
   *   msgId: 1,
   *   result: [...],
   *   javaStartTime: 1633027200000,
   *   javaEndTime: 1633027201000,
   *   error: undefined
   * });
   */
  const onSQLResponse = function (jsonMsg) {
    let err = null;

    const request = this.currentMessages[jsonMsg.msgId];
    delete this.currentMessages[jsonMsg.msgId];

    let result = jsonMsg.result;
    if (result.length === 1) {
      result = result[0]; // if there is only one just return the first RS not a set of RS's
    }

    const currentTime = new Date().getTime();
    const sendTimeMS = currentTime - jsonMsg.javaEndTime;
    const hrend = process.hrtime(request.hrstart);
    const javaDuration = jsonMsg.javaEndTime - jsonMsg.javaStartTime;

    if (jsonMsg.error !== undefined) {
      err = new Error(jsonMsg.error);
    }

    if (this.logTiming) {
      this.log(
        "Execution time (hr): %ds %dms dbTime: %dms dbSendTime: %d sql=%s",
        hrend[0],
        hrend[1] / 1000000,
        javaDuration,
        sendTimeMS,
        request.sql
      );
    }

    // Check if request.callback is a function before invoking it
    if (typeof request.callback === "function") {
      request.callback(err, result);
    }
  }.bind(this);

  /**
   * Handles SQL errors from the database.
   *
   * @param {string|Object} data - The error data received from the database.
   *
   * @example
   * this.onSQLError("Some SQL error message");
   */
  const onSQLError = function (data) {
    const error = new Error(data);

    const callBackFuncitons = [];
    for (const k in this.currentMessages) {
      if (this.currentMessages.hasOwnProperty(k)) {
        callBackFuncitons.push(this.currentMessages[k].callback);
      }
    }

    this.currentMessages = [];
    callBackFuncitons.forEach(function (cb) {
      cb(error);
    });
  }.bind(this);

  const connectCore = function (callback) {
    this.javaDB = spawn("java", [
      "-jar",
      this.pathToJavaBridge,
      this.host,
      this.port,
      this.database,
      this.username,
      this.password,
      this.minConnections.toString(),
      this.maxConnections.toString(),
      this.connectionTimeout.toString(),
      this.idleTimeout.toString(),
      this.keepaliveTime.toString(),
      this.maxLifetime.toString(),
      this.transactionConnections.toString()
    ]);

    const handleConnection = (resolve, reject) => {
      let dataStr;
      let hasConnected = false;

      this.javaDB.stdout.on("data", (data) => {
        if (hasConnected) return;

        dataStr = data.toString().trim();
        console.log('Java stdout received:', dataStr);

        if (dataStr === "connected") {
          hasConnected = true;
          this.javaDB.stderr.removeAllListeners("data");
          this.connected = true;

          this.javaDB.stdout
              .pipe(this.jsonParser)
              .on("data", (jsonMsg) => {
                onSQLResponse(jsonMsg);
              });

          if (callback) callback(null, dataStr);
          else resolve(dataStr);
        }
      });

      this.javaDB.stderr.on("data", (data) => {
        const errorMessage = data.toString();
        console.log('Java stderr received:', errorMessage);

        // Ignore HikariCP info/warning messages
        if (errorMessage.includes('[main] INFO') ||
            errorMessage.includes('[Thread-') ||
            errorMessage.includes('HikariPool') ||
            errorMessage.includes('WARN')) {
          return; // Just log messages, not errors
        }

        // Only treat as error if it's a real error and we haven't connected yet
        if (!hasConnected) {
          this.javaDB.stdout.removeAllListeners("data");
          this.javaDB.kill();
          const error = new Error(errorMessage);
          if (callback) callback(error, null);
          else reject(error);
        }
      });
    };

    if (callback) {
      handleConnection(null, null);
    } else {
      return new Promise(handleConnection);
    }
  }.bind(this);

  this.connect = function (callback) {
    connectCore(callback);
  };

  this.connectAsync = function () {
    return connectCore();
  };

  /**
   * Prepares a SQL query to be executed asynchronously.
   * @param {string} sql - The SQL query to execute.
   * @param {number} transactionId - The transaction ID to use, defaults to -1 (no transaction).
   * @param {boolean} finishTransaction - Whether to finish the transaction after the query is done. Defaults to false.
   * @param {function} callback - The callback function to execute once the query is done.
   * Returns a stringified message to be sent to the Java process.
   */
  const prepareQuery = function (sql, transactionId, finishTransaction = false, callback) {
    if (!this.isConnected()) {
      if (callback) callback(new Error("Database isn't connected."));

      return null;
    }

    const hrstart = process.hrtime();
    this.queryCount++;

    const msg = {
      msgId: this.queryCount,
      transId: transactionId,
      finishTrans: finishTransaction,
      sql: sql,
      sentTime: new Date().getTime(),
      callback: callback,
      hrstart: hrstart,
    };

    const strMsg = JSON.stringify(msg).replace(/[\n]/g, "\\n");

    this.log(
      `prepareQuery: msgId: ${msg.msgId} currentMessages: ${Object.keys(this.currentMessages).length} this.queryCount: ${this.queryCount}`
    );

    this.currentMessages[msg.msgId] = msg;

    return strMsg;
  }.bind(this);

  /**
   * Executes a SQL query asynchronously and returns the result via a callback.
   *
   * @param {string} sql - The SQL query to execute.
   * @param {function} callback - The callback function to execute once the query is done.
   *
   * @example
   * const sybase = new Sybase(...);
   * sybase.query('SELECT * FROM users', (err, result) => {
   *   if (err) {
   *     console.error(err);
   *     return;
   *   }
   *   console.log(result);
   * });
   */
  this.query = function (sql, callback) {
    const strMsg = prepareQuery(sql, -1, false, callback);
    if (strMsg === null) return;

    this.javaDB.stdin.write(strMsg + "\n");
    this.log(`SQL request written: ${strMsg}`);
  };

  /**
   * Executes a SQL query synchronously and returns the result.
   *
   * @param {string} sql - The SQL query to execute.
   * @param {number} transactionId - The transaction ID to use, defaults to -1 (no transaction).
   * @param {boolean} finishTransaction - Whether to finish the transaction after the query is done. Defaults to false.
   * @returns {Object} The result of the query.
   *
   * @example
   * const sybase = new Sybase(...);
   * try {
   *   const result = sybase.querySync('SELECT * FROM users');
   *   console.log(result);
   * } catch (err) {
   *   console.error(err);
   * }
   */
  this.querySync = function (sql, transactionId = -1, finishTransaction = false) {
    return new Promise((resolve, reject) => {
      const strMsg = prepareQuery(sql, transactionId, finishTransaction, null);

      if (strMsg === null) {
        reject(new Error("Database isn't connected."));
        return;
      }

      const onResponse = (jsonMsg) => {
        if (jsonMsg.msgId === this.queryCount) {
          this.jsonParser.removeListener("data", onResponse);
          if (jsonMsg.error !== undefined) reject(new Error(jsonMsg.error));
          else resolve(jsonMsg.result);
        }
      };

      this.jsonParser.on("data", onResponse);

      try {
        this.javaDB.stdin.write(strMsg + "\n");
        this.log(`SQL request written: ${strMsg}`);
      } catch (err) {
        reject(err); // Reject if writing to stdin fails
      }
    });
  };

  /**
   * Executes a series of queries within a transaction.
   *
   * @async
   * @param {Function} queriesFunction - A function that takes the Sybase connection as an argument and returns a Promise.
   * @returns {Promise<any>} - Returns a Promise that resolves with the result of the queries or rejects with an error.
   *
   * @example
   * async function main() {
   *   try {
   *     const result = await sybase.transaction(async (connection, transactionId) => {
   *       const user = await connection.querySync('SELECT * FROM users WHERE id = 1', transactionId);
   *       await connection.querySync(`UPDATE users SET name = 'John' WHERE id = 1`, transactionId);
   *       return user;
   *     });
   *     console.log('Transaction successful, result:', result);
   *   } catch (err) {
   *     console.error('Transaction failed:', err);
   *   }
   * }
   *
   * main();
   */
  this.transaction = async function (queriesFunction) {
    let result;
    let error;

    const transactionId = this.transactionCount++;
    try {
      await this.querySync("BEGIN TRANSACTION", transactionId);

      result = await queriesFunction(this);

      await this.querySync("COMMIT TRANSACTION", transactionId, true);
    } catch (err) {
      error = err;
      await this.querySync("ROLLBACK TRANSACTION", transactionId, true);
    }

    if (error) {
      throw error;
    }

    return result;
  };

  /**
   * Retrieves the version of the Sybase database.
   *
   * @returns {Promise<string>} A promise that resolves with the version of the Sybase database.
   * @throws {Error} Throws an error if the process fails or if not connected.
   *
   * @example
   * const sybase = new Sybase(...);
   * try {
   *   const version = await sybase.getVersion();
   *   console.log(`Connected to Sybase version: ${version}`);
   * } catch (error) {
   *   console.error(`Error retrieving Sybase version: ${error.message}`);
   * }
   */
  this.getVersion = async function () {
    if (!this.connected) {
      throw new Error("Not connected to the Sybase database.");
    }

    try {
      const result = await this.querySync("SELECT @@version AS version");
      if (result && result.length && result[0].length && result[0][0].version) {
        return result[0][0].version;
      }
      throw new Error("Failed to retrieve Sybase version.");
    } catch (error) {
      throw new Error(
        `Failed to retrieve Sybase version due to: ${error.message}`
      );
    }
  };

  /**
   * Disconnects from the database and kills the Java process.
   *
   * @example
   * const sybase = new Sybase(...);
   * sybase.disconnect();
   */
  this.disconnect = function () {
    this.javaDB.kill();
    this.connected = false;
  };

  /**
   * Disconnects synchronously from the database and kills the Java process.
   *
   * @example
   * const sybase = new Sybase(...);
   * await sybase.disconnectSync();
   */
  this.disconnectSync = function () {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        resolve(); // Resolve immediately if not connected
        return;
      }

      this.javaDB.on("exit", (code) => {
        this.connected = false;
        if (code !== null && code !== 0 && code !== 143) {
          reject(new Error(`Java process exited with code ${code}`));
        } else {
          resolve();
        }
      });

      this.javaDB.on("error", (err) => {
        reject(err); // Reject on error
      });

      this.javaDB.kill(); // Attempt to kill the Java process
    });
  };

  /**
   * Checks if the database is connected.
   *
   * @returns {boolean} True if connected, false otherwise.
   *
   * @example
   * const sybase = new Sybase(...);
   * const isConnected = sybase.isConnected();
   * console.log(`Is connected: ${isConnected}`);
   */
  this.isConnected = function () {
    return this.connected;
  };

  /**
   * Logs a message to the console if logs is enabled.
   *
   * @param {string} msg - The message to log.
   *
   * @example
   * const sybase = new Sybase(...);
   * sybase.log('This is a log message.');
   */
  this.log = function (msg) {
    if (this.logs) {
      console.log(msg);
    }
  };
}

// Export the Sybase class for backward compatibility
module.exports = Sybase;

// Export additional functions for easier usage as an npm package
module.exports.Sybase = Sybase;
module.exports.createConnection = createConnection;

/**
 * Creates and connects to a Sybase database.
 * 
 * @param {Object} config - Configuration object for the Sybase connection
 * @returns {Promise<Sybase>} A promise that resolves to a connected Sybase instance
 */
module.exports.connect = async function(config) {
  const db = createConnection(config);
  await db.connectAsync();
  return db;
};

/**
 * Executes a query on a new connection and then disconnects.
 * 
 * @param {Object} config - Configuration object for the Sybase connection
 * @param {string} sql - SQL query to execute
 * @returns {Promise<any>} A promise that resolves to the query result
 */
module.exports.query = async function(config, sql) {
  const db = await module.exports.connect(config);
  try {
    const result = await db.querySync(sql);
    await db.disconnectSync();
    return result;
  } catch (error) {
    await db.disconnectSync();
    throw error;
  }
};
