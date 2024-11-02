require("dotenv").config();
const mineflayer = require("mineflayer");
const { MongoClient } = require("mongodb");
const antiafk = require("mineflayer-antiafk");

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

const bot = mineflayer.createBot({
    host: "constantiam.net",
    port: 25565,
    username: process.env.MINECRAFT_USERNAME,
    password: process.env.MINECRAFT_PASSWORD,
    auth: "microsoft",
});
bot.loadPlugin(antiafk);

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        return client.db("constantiam");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
}

async function initVotes(collection) {
    const candidates = await collection.collection("votes").find({}).toArray();
    if (candidates.length === 0) {
        await collection.collection("votes").insertOne({ FloppyIsDumb: [] });
    }
}

async function loadUserVotes(collection) {
    const userVotes = await collection
        .collection("userVotes")
        .find({})
        .toArray();
    return userVotes.reduce((acc, vote) => {
        acc[vote.username] = vote.candidate;
        return acc;
    }, {});
}

function whisper(username, message) {
    bot.chat(`/w ${username} ${message}`);
}

bot.on("spawn", async () => {
    bot.afk.setOptions({ fishing: false });
    bot.afk.start();
    const db = await connectDB();
    await initVotes(db);
    const userVotes = await loadUserVotes(db);

    bot.chat(
        "I am a voting bot! Use !vote <candidate> to vote, !candidates to list all candidates, DM floppy1703 on discord to add a new candidate."
    );
    bot.userVotes = userVotes;

    setInterval(() => {
        bot.chat(
            "I am a voting bot! Use !vote <candidate> to vote, !candidates to list all candidates, DM floppy1703 on discord to add a new candidate."
        );
    }, 300000);
    setInterval(() => {
        bot.chat(
            "Join the UNRIGGED ELECTIONS discord server: https://discord.gg/K7WKbW8F6J"
        );
    }, 150000);
});

bot.on("chat", async (username, message) => {
    const db = await connectDB();
    const votesCollection = db.collection("votes");
    const userVotesCollection = db.collection("userVotes");

    if (message.startsWith("!vote ")) {
        const args = message.split("|")[0].trim().split(" ");
        const candidate = args[1];

        const candidates = await votesCollection.find({}).toArray();
        const candidateNames = Object.keys(candidates[0]).filter(
            (key) => key !== "_id"
        );

        if (!candidateNames.includes(candidate)) {
            whisper(
                username,
                `The candidate "${candidate}" does not exist. Please check the name and try again.`
            );
            return;
        }

        if (!bot.userVotes[username]) {
            bot.userVotes[username] = candidate;

            await votesCollection.updateOne(
                { [candidate]: { $exists: true } },
                { $addToSet: { [candidate]: username } }
            );

            await userVotesCollection.updateOne(
                { username: username },
                { $set: { candidate: candidate } },
                { upsert: true }
            );

            whisper(username, `You voted for ${candidate}!`);
        } else {
            whisper(
                username,
                `You have already voted for ${bot.userVotes[username]}.`
            );
        }
    }

    if (message.startsWith("!candidates")) {
        const candidates = await votesCollection.find({}).toArray();
        const candidateNames = Object.keys(candidates[0]).filter(
            (key) => key !== "_id"
        );
        const candidateList = candidateNames.join(", ");
        whisper(username, `Current candidates: ${candidateList}`);
    }

    if (message.startsWith("!addcandidate ")) {
        if (username === "FloppyIsDumb") {
            const newCandidate = message.split(" ")[1];
            if (!newCandidate) {
                whisper(username, "Please specify a candidate name.");
                return;
            }

            await votesCollection.updateOne(
                { [newCandidate]: { $exists: false } },
                { $set: { [newCandidate]: [] } }
            );

            whisper(username, `${newCandidate} has been added as a candidate!`);
        } else {
            whisper(username, "You do not have permission to add a candidate.");
        }
    }
});

bot.on("error", (err) => {
    console.error(err);
});
