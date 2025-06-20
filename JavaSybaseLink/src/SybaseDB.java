import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Properties;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 *
 * @author rod
 */
public class SybaseDB {

	public static final int TYPE_TIME_STAMP = 93;
	public static final int TYPE_DATE = 91;
	public static final int TYPE_TIME = 92;

	public static final int NUMBER_OF_THREADS = 5;

	String host;
	Integer port;
	String dbname;
	String username;
	String password;
	Properties props;
	Connection conn;
	DateFormat df = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.S'Z'");
	ExecutorService executor = Executors.newFixedThreadPool(NUMBER_OF_THREADS);

	public SybaseDB(String host, Integer port, String dbname, String username, String password)
	{
		this(host, port, dbname, username, password, new Properties());
	}
	public SybaseDB(String host, Integer port, String dbname, String username, String password, Properties props)
	{
		this.host = host;
		this.port = port;
		this.dbname = dbname;
		this.username = username;
		this.password = password;
		this.props = props;
		this.props.put("user", username);
		this.props.put("password", password);
		df.setTimeZone(TimeZone.getTimeZone("UTC"));
	}

	public boolean connect()
	{
		try {
			Class.forName("com.sybase.jdbc4.jdbc.SybDriver");
			// FIXED: Use ServiceName instead of slash notation
			String url = "jdbc:sybase:Tds:" + host + ":" + port + "?ServiceName=" + dbname;
			System.out.println("DEBUG: Connecting with URL: " + url);
			conn = DriverManager.getConnection(url, props);

			// Verify which database we're connected to
			try (Statement stmt = conn.createStatement();
				 ResultSet rs = stmt.executeQuery("SELECT DB_NAME() as current_database")) {
				if (rs.next()) {
					String currentDb = rs.getString("current_database");
					System.out.println("DEBUG: Successfully connected to database: " + currentDb);
				}
			} catch (Exception debugEx) {
				System.out.println("DEBUG: Could not verify database name: " + debugEx.getMessage());
			}

			return true;

		} catch (Exception ex) {
			System.err.println("Connection failed: " + ex.getMessage());
			System.err.println("Full exception: " + ex);
			return false;
		}
	}

	public boolean disconnect()
	{
		try {
			if (conn != null && !conn.isClosed()) {
				conn.close();
			}
			if (executor != null) {
				executor.shutdown();
			}
			return true;
		} catch (Exception ex) {
			System.err.println("Disconnect failed: " + ex.getMessage());
			return false;
		}
	}

	public void execSQL(String sqlQuery)
	{
		try (Statement stmt = conn.createStatement();
			 ResultSet rs = stmt.executeQuery(sqlQuery)) {

			System.out.println("Query: " + sqlQuery);
			while (rs.next()) {
				System.out.println("Result: " + rs.getString(1));
			}
		} catch (Exception ex) {
			System.err.println("Query failed: " + ex.getMessage());
		}
	}
}