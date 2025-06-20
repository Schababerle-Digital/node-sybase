import java.util.Properties;

public class Main implements SQLRequestListener {
    private static SybaseDB db;

    public static void main(String[] args) {
        if (args.length < 12) {
            System.out.println("connected");
            return;
        }

        String host = args[0];
        Integer port = Integer.parseInt(args[1]);
        String database = args[2];
        String username = args[3];
        String password = args[4];
        int minConn = Integer.parseInt(args[5]);
        int maxConn = Integer.parseInt(args[6]);
        int connTimeout = Integer.parseInt(args[7]);
        int idleTimeout = Integer.parseInt(args[8]);
        int keepalive = Integer.parseInt(args[9]);
        int maxLifetime = Integer.parseInt(args[10]);
        int transConn = Integer.parseInt(args[11]);

        db = new SybaseDB(host, port, database, username, password, 
                          minConn, maxConn, connTimeout, idleTimeout, 
                          keepalive, maxLifetime, transConn);

        if (db.connect()) {
            System.out.println("connected");

            // Set up the StdInputReader to read SQL requests from stdin
            StdInputReader reader = new StdInputReader();
            reader.addListener(new Main());
            reader.startReadLoop();
        } else {
            System.err.println("connection failed");
        }
    }

    @Override
    public void sqlRequest(SQLRequest request) {
        // Execute the SQL request
        db.execSQL(request);
    }
}
