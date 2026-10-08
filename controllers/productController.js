const productModel = require("../models/productModel");
const path = require("path");
const { unlink } = require("fs");

function removePhoto(photo) {
    if (!photo) {
        return;
    }
    const publicPath = path.resolve("./", "public/img/uploades");
    unlink(path.join(publicPath, photo), err => {
        if (err && err.code !== "ENOENT") {
            console.error("Failed to remove product photo:", err);
        }
    });
}

const index = async (req, res) => {
    try {
        const products = await productModel.index();
        return res.render("pages/products/index", {
            products,
            msg: req.query.msg,
            userRole: req.session.userRole
        });
    } catch (err) {
        console.error("Failed to load products:", err);
        return res.status(500).send("Could not load products.");
    }
};

const home = async (req, res) => {
    try {
        const products = await productModel.publicIndex();
        return res.render("pages/home", { products });
    } catch (err) {
        console.error("Failed to load public products:", err);
        return res.status(500).send("Could not load products.");
    }
};

const show = async (req, res) => {
    try {
        const oneProduct = await productModel.show(req.params.id);
        return res.render("pages/products/show", { oneProduct });
    } catch (err) {
        console.error("Failed to load product:", err);
        return res.status(500).send("Could not load product.");
    }
};

const createForm = (req, res) => res.render("pages/products/createForm", {
    userRole: req.session.userRole
});

const store = async (req, res) => {
    const productData = {
        productName: req.body.productName,
        weight: req.body.weight,
        photo: req.file ? req.file.filename : ""
    };

    try {
        if (req.session.userRole === "editor") {
            await productModel.queueApproval("create", productData, req.session.fullname);
            return res.redirect("/products?msg=Product submitted for administrator approval.");
        }
        await productModel.store(productData);
        return res.redirect("/products?msg=Product created.");
    } catch (err) {
        console.error("Failed to create product:", err);
        return res.status(500).send("Could not create product.");
    }
};

const updateForm = async (req, res) => {
    try {
        const oneProduct = await productModel.updateForm(req.params.id);
        if (oneProduct.length === 0) {
            return res.redirect("/products?msg=Product not found.");
        }
        return res.render("pages/products/updateForm", {
            oneProduct,
            userRole: req.session.userRole
        });
    } catch (err) {
        console.error("Failed to load product form:", err);
        return res.status(500).send("Could not load product.");
    }
};

const update = async (req, res) => {
    let oneProduct;
    try {
        oneProduct = await productModel.show(req.body.id);
        if (oneProduct.length === 0) {
            return res.redirect("/products?msg=Product not found.");
        }

        const productData = {
            id: req.body.id,
            productName: req.body.productName,
            weight: req.body.weight,
            photo: req.file ? req.file.filename : oneProduct[0].photo
        };

        if (req.session.userRole === "editor") {
            await productModel.queueApproval(
                "update",
                productData,
                req.session.fullname,
                oneProduct[0].photo
            );
            return res.redirect("/products?msg=Product update submitted for administrator approval.");
        }

        await productModel.update(productData);
        if (req.file && oneProduct[0].photo) {
            removePhoto(oneProduct[0].photo);
        }
        return res.redirect("/products?msg=Product updated.");
    } catch (err) {
        console.error("Failed to update product:", err);
        return res.status(500).send("Could not update product.");
    }
};

const destroy = async (req, res) => {
    try {
        const oneProduct = await productModel.show(req.params.id);
        if (oneProduct.length === 0) {
            return res.redirect("/products?msg=Product not found.");
        }

        if (req.session.userRole === "editor") {
            await productModel.queueApproval("delete", { id: req.params.id }, req.session.fullname);
            return res.redirect("/products?msg=Product deletion submitted for administrator approval.");
        }

        await productModel.destroy(req.params.id);
        removePhoto(oneProduct[0].photo);
        return res.redirect("/products?msg=Product deleted.");
    } catch (err) {
        console.error("Failed to delete product:", err);
        return res.status(500).send("Could not delete product.");
    }
};

const approvals = async (req, res) => {
    try {
        const requests = await productModel.listApprovals();
        return res.render("pages/products/approvals", { requests, msg: req.query.msg });
    } catch (err) {
        console.error("Failed to load product approvals:", err);
        return res.status(500).send("Could not load product approvals.");
    }
};

const decideApproval = async (req, res) => {
    try {
        if (!["accept", "reject"].includes(req.body.decision)) {
            return res.status(400).send("A valid approval decision is required.");
        }
        const accepted = req.body.decision === "accept";
        const request = await productModel.listApprovals();
        const pending = request.find(item => item._id.toString() === req.params.id);
        if (!pending) {
            return res.redirect("/products/approvals?msg=Request not found.");
        }

        const currentProduct = accepted && ["delete", "update"].includes(pending.action) && pending.productId
            ? await productModel.show(pending.productId.toString())
            : [];
        await productModel.decideApproval(req.params.id, accepted);
        if (accepted && currentProduct.length &&
            (pending.action === "delete" ||
                (pending.action === "update" && currentProduct[0].photo !== pending.productData.photo))) {
            removePhoto(currentProduct[0].photo);
        }
        if (!accepted && ["create", "update"].includes(pending.action) &&
            pending.productData.photo !== pending.previousPhoto) {
            removePhoto(pending.productData.photo);
        }
        return res.redirect(
            `/products/approvals?msg=${accepted
                ? "Change approved and applied to products."
                : "Change rejected. The product was left unchanged."}`
        );
    } catch (err) {
        console.error("Failed to decide product approval:", err);
        return res.status(500).send("Could not process approval.");
    }
};

module.exports = {
    index,
    home,
    show,
    createForm,
    store,
    updateForm,
    update,
    destroy,
    approvals,
    decideApproval
};
