const authModel = require("../models/authModel");
const bcrypt = require("bcrypt");

const signup = async (req, res) => {
    try {
        if (await authModel.countUsers() !== 0) {
            return res.redirect("/signin?failed=Ask an administrator to create your account.");
        }
        return res.render("../views/dashboard/signup.ejs", { msg: req.query.msg });
    } catch (err) {
        console.error("Failed to check initial admin setup:", err);
        return res.status(503).send("Account setup is temporarily unavailable.");
    }
};

const createInitialAdmin = async (req, res) => {
    const { fullname, username, password, confirmPassword } = req.body;
    if (!fullname || !username || !password || !confirmPassword) {
        return res.redirect("/signup?msg=Complete all fields.");
    }
    if (password !== confirmPassword) {
        return res.redirect("/signup?msg=Passwords do not match.");
    }

    try {
        const created = await authModel.createInitialAdmin({ fullname, username, password });
        if (!created) {
            return res.redirect("/signin?failed=Ask an administrator to create your account.");
        }
        return res.redirect("/signin?registerComplete=Initial administrator created. Sign in to continue.");
    } catch (err) {
        console.error("Failed to create initial administrator:", err);
        return res.redirect("/signup?msg=Could not create the initial account. Please try again.");
    }
};

const signin = (req, res) => {
    const registerComplete = req.query.registerComplete;
    const failed = req.query.failed;
    const logout = req.query.logout;
    res.render("../views/dashboard/signin.ejs", { registerComplete, failed, logout });
};

const verifySignin = async (req, res) => {
    try {
        const users = await authModel.findByUsername(req.body.username);
        if (users.length === 0 || users[0].isActive !== true ||
            !["admin", "editor"].includes(users[0].userRole)) {
            return res.redirect("/signin?failed=Invalid credentials or inactive account.");
        }

        const passwordMatches = await bcrypt.compare(req.body.password, users[0].password);
        if (!passwordMatches) {
            return res.redirect("/signin?failed=Invalid credentials or inactive account.");
        }

        req.session.userID = users[0]._id.toString();
        req.session.fullname = users[0].fullname;
        req.session.userRole = users[0].userRole;
        return res.redirect("/dashboard/index");
    } catch (err) {
        console.error("Failed to sign in:", err);
        return res.redirect("/signin?failed=Sign in is temporarily unavailable.");
    }
};

const logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Failed to end user session:", err);
            return res.redirect("/signin?failed=Could not sign out. Please try again.");
        }
        return res.redirect("/signin?logout=You are signed out.");
    });
};

const isAthu = async (req, res, next) => {
    if (!req.session.userID) {
        return res.redirect("/signin?failed=Please sign in first.");
    }

    try {
        const user = await authModel.findById(req.session.userID);
        if (!user || user.isActive !== true ||
            !["admin", "editor"].includes(user.userRole)) {
            req.session.destroy(err => {
                if (err) {
                    console.error("Failed to end inactive user session:", err);
                }
                return res.redirect("/signin?failed=Your account is inactive. Contact an administrator.");
            });
            return;
        }

        req.session.userRole = user.userRole;
        req.session.fullname = user.fullname;
        res.locals.fullname = user.fullname;
        res.locals.userRole = user.userRole;
        return next();
    } catch (err) {
        console.error("Failed to verify signed-in user:", err);
        return res.status(503).send("Authentication service is temporarily unavailable.");
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.userRole !== "admin") {
        return res.status(403).send("Administrator access required.");
    }
    return next();
};

const createUser = async (req, res) => {
    const { fullname, username, password, confirmPassword, userRole } = req.body;
    if (!fullname || !username || !password || !confirmPassword ||
        !["admin", "editor"].includes(userRole)) {
        return res.redirect("/users/createForm?msg=Complete all fields and select a valid role.");
    }
    if (password !== confirmPassword) {
        return res.redirect("/users/createForm?msg=Passwords do not match.");
    }

    try {
        if ((await authModel.findByUsername(username.trim())).length !== 0) {
            return res.redirect("/users/createForm?msg=That username already exists.");
        }

        await authModel.createUser({
            fullname,
            username,
            password,
            userRole,
            isActive: req.body.isActive === "true"
        });
        return res.redirect("/users?msg=User created successfully.");
    } catch (err) {
        console.error("Failed to create user:", err);
        return res.redirect("/users/createForm?msg=Could not create user. Please try again.");
    }
};

const users = async (req, res) => {
    try {
        const userList = await authModel.listUsers();
        return res.render("pages/users/index", {
            users: userList,
            msg: req.query.msg,
            currentUserId: req.session.userID
        });
    } catch (err) {
        console.error("Failed to load users:", err);
        return res.status(500).send("Could not load users.");
    }
};

const createUserForm = (req, res) => {
    res.render("pages/users/createForm", { msg: req.query.msg });
};

const toggleUserActive = async (req, res) => {
    if (req.params.id === req.session.userID) {
        return res.redirect("/users?msg=You cannot deactivate your own account.");
    }
    try {
        const user = await authModel.findById(req.params.id);
        if (!user) {
            return res.redirect("/users?msg=User not found.");
        }
        await authModel.setUserActive(req.params.id, user.isActive !== true);
        return res.redirect("/users");
    } catch (err) {
        console.error("Failed to change user activation:", err);
        return res.redirect("/users?msg=Could not update account status.");
    }
};

module.exports = {
    signup,
    createInitialAdmin,
    signin,
    verifySignin,
    logout,
    isAthu,
    isAdmin,
    createUser,
    users,
    createUserForm,
    toggleUserActive
};
