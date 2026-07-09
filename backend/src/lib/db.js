import mongoose from "mongoose";
import dns from "dns";

if (dns.getServers().includes("127.0.0.1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

export async function connectDB() {
    try {
        const mongoUri = process.env.MONGO_URI;
        if(!mongoUri){
            throw new Error("MONGO_URI is required");
        }  
        
        const conn = await mongoose.connect(mongoUri);
        console.log("MongoDB Connected : ", conn.connection.host);

    }
    catch (error) {
        console.log("Error connecting to MongoDB :", error.message);
        process.exit(1);
    }
}