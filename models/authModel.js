const { MongoClient, ObjectId, mongoConnection } = require('./mongodbConnection.js');
const { hash } = require("bcrypt");

async function withUsersCollection(callback) {
    const client = await MongoClient.connect(mongoConnection);
    try {
        return await callback(client.db().collection("users"));
    } finally {
        await client.close();
    }
}

async function findByUsername(username) {
    return withUsersCollection(users => users.find({ username }).limit(1).toArray());
}

async function findById(id) {
    if (!ObjectId.isValid(String(id))) {
        return null;
    }
    return withUsersCollection(users => users.findOne({ _id: new ObjectId(String(id)) }));
}

async function listUsers() {
    return withUsersCollection(users => users.find({}, {
        projection: { password: 0 }
    }).sort({ username: 1 }).toArray());
}

async function countUsers() {
    return withUsersCollection(users => users.countDocuments());
}

async function createUser(userData) {
    const user = {
        fullname: userData.fullname.trim(),
        username: userData.username.trim(),
        password: await hash(userData.password, 11),
        userRole: userData.userRole,
        isActive: userData.isActive === true
    };
    return withUsersCollection(users => users.insertOne(user));
}

async function createInitialAdmin(userData) {
    const passwordHash = await hash(userData.password, 11);
    const client = await MongoClient.connect(mongoConnection);
    const db = client.db();
    const users = db.collection("users");
    const setup = db.collection("systemConfig");

    try {
        if (await users.countDocuments() !== 0) {
            return false;
        }

        try {
            const claim = await setup.updateOne(
                { _id: "initialAdmin", state: { $exists: false } },
                { $set: { state: "creating" } },
                { upsert: true }
            );
            if (claim.upsertedCount !== 1) {
                return false;
            }
        } catch (err) {
            if (err.code === 11000) {
                return false;
            }
            throw err;
        }

        try {
            await users.insertOne({
                fullname: userData.fullname.trim(),
                username: userData.username.trim(),
                password: passwordHash,
                userRole: "admin",
                isActive: true
            });
            await setup.updateOne(
                { _id: "initialAdmin", state: "creating" },
                { $set: { state: "complete" } }
            );
            return true;
        } catch (err) {
            if (await users.countDocuments() === 0) {
                await setup.deleteOne({ _id: "initialAdmin", state: "creating" });
            }
            throw err;
        }
    } finally {
        await client.close();
    }
}

async function setUserActive(id, isActive) {
    if (!ObjectId.isValid(String(id))) {
        return null;
    }
    return withUsersCollection(users => users.updateOne(
        { _id: new ObjectId(String(id)) },
        { $set: { isActive } }
    ));
}

module.exports = {
    findByUsername,
    findById,
    listUsers,
    countUsers,
    createUser,
    createInitialAdmin,
    setUserActive
};
