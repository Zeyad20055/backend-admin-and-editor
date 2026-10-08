const { MongoClient, ObjectId, mongoConnection } = require('./mongodbConnection');

async function withDatabase(callback) {
    const client = await MongoClient.connect(mongoConnection);
    try {
        return await callback(client.db());
    } finally {
        await client.close();
    }
}

async function index() {
    return withDatabase(db => db.collection("products").find().sort({ productName: 1 }).toArray());
}

async function publicIndex() {
    return withDatabase(db => db.collection("products")
        .find({
            $or: [
                { isApproved: true },
                { isApproved: { $exists: false } }
            ]
        })
        .sort({ productName: 1 })
        .toArray());
}

async function show(id) {
    if (!ObjectId.isValid(String(id))) {
        return [];
    }
    return withDatabase(db => db.collection("products")
        .find({ _id: new ObjectId(String(id)) }).toArray());
}

async function store(productData) {
    const product = {
        productName: productData.productName,
        weight: productData.weight,
        photo: productData.photo || "",
        isApproved: true
    };
    return withDatabase(db => db.collection("products").insertOne(product));
}

async function updateForm(id) {
    return show(id);
}

async function update(updateFormData) {
    if (!ObjectId.isValid(String(updateFormData.id))) {
        return null;
    }

    const updateQuery = {
        productName: updateFormData.productName,
        weight: updateFormData.weight
    };
    if (updateFormData.photo) {
        updateQuery.photo = updateFormData.photo;
    }

    return withDatabase(db => db.collection("products").updateOne(
        { _id: new ObjectId(String(updateFormData.id)) },
        { $set: updateQuery }
    ));
}

async function destroy(id) {
    if (!ObjectId.isValid(String(id))) {
        return null;
    }
    return withDatabase(db => db.collection("products").deleteOne({
        _id: new ObjectId(String(id))
    }));
}

async function queueApproval(action, productData, requestedBy, previousPhoto) {
    const request = {
        action,
        productData,
        requestedBy,
        createdAt: new Date()
    };
    if (previousPhoto !== undefined) {
        request.previousPhoto = previousPhoto;
    }
    if (productData.id) {
        if (!ObjectId.isValid(String(productData.id))) {
            throw new Error("Invalid product ID");
        }
        request.productId = new ObjectId(String(productData.id));
        delete request.productData.id;
    }
    return withDatabase(db => db.collection("productApprovals").insertOne(request));
}

async function listApprovals() {
    return withDatabase(db => db.collection("productApprovals")
        .find().sort({ createdAt: 1 }).toArray());
}

async function decideApproval(id, accepted) {
    if (!ObjectId.isValid(String(id))) {
        return false;
    }

    return withDatabase(async db => {
        const approvals = db.collection("productApprovals");
        const requestId = new ObjectId(String(id));
        const request = await approvals.findOne({ _id: requestId });
        if (!request) {
            return false;
        }

        if (accepted) {
            const products = db.collection("products");
            if (request.action === "create") {
                await products.insertOne({ ...request.productData, isApproved: true });
            } else if (request.action === "update") {
                const result = await products.updateOne(
                    { _id: request.productId },
                    { $set: { ...request.productData, isApproved: true } }
                );
                if (result.matchedCount === 0) {
                    throw new Error("Product requested for update no longer exists");
                }
            } else if (request.action === "delete") {
                const result = await products.deleteOne({ _id: request.productId });
                if (result.deletedCount === 0) {
                    throw new Error("Product requested for deletion no longer exists");
                }
            } else {
                throw new Error(`Unknown product approval action: ${request.action}`);
            }
        }

        await approvals.deleteOne({ _id: requestId });
        return true;
    });
}

module.exports = {
    index,
    publicIndex,
    show,
    store,
    updateForm,
    update,
    destroy,
    queueApproval,
    listApprovals,
    decideApproval
};
