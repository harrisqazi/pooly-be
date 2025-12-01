require('dotenv').config(); // Loads your .env secrets
const { Client } = require('pg'); // The Postgres talker

async function test() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL, // Uses your secret URL
  });
  
  await client.connect(); // Tries to connect
  const res = await client.query('SELECT * FROM groups'); // Asks for groups data
  console.log('Database connected! Here are your groups:');
  console.log(res.rows); // Prints the data
  await client.end(); // Closes connection
}

test(); // Runs the test