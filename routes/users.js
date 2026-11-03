var User = require('../models/user');
var Task = require('../models/task');
var helpers = require('./helpers');

var send = helpers.send;
var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function saveUser(req, res, user) {
    var body = req.body || {};
    var name = body.name;
    var email = body.email;
    var pendingTasks = body.pendingTasks;

    if (typeof name !== 'string' || name.trim() === '') {
        return send(res, 400, 'User name is required');
    }
    if (typeof email !== 'string' || !emailRegex.test(email)) {
        return send(res, 400, 'A valid email is required');
    }
    if (pendingTasks === undefined || pendingTasks === null) {
        pendingTasks = [];
    }
    if (!Array.isArray(pendingTasks)) {
        return send(res, 400, 'pendingTasks must be a list of task ids');
    }
    for (var i = 0; i < pendingTasks.length; i++) {
        if (!helpers.isId(pendingTasks[i])) {
            return send(res, 400, 'pendingTasks contains an invalid task id');
        }
    }
    pendingTasks = pendingTasks.filter(function (id, index) {
        return pendingTasks.indexOf(id) === index;
    });

    try {
        var sameEmail = await User.findOne({ email: email });
        if (sameEmail && (!user || !sameEmail._id.equals(user._id))) {
            return send(res, 400, 'This email is already used by another user');
        }

        var tasks = await Task.find({ _id: { $in: pendingTasks } });
        if (tasks.length !== pendingTasks.length) {
            return send(res, 404, 'A task in pendingTasks was not found');
        }
        for (var j = 0; j < tasks.length; j++) {
            if (tasks[j].completed) {
                return send(res, 400, 'Completed tasks cannot be in pendingTasks');
            }
        }

        var isNew = !user;
        if (isNew) {
            user = new User();
        }
        var id = user._id.toString();
        var removed = user.pendingTasks.filter(function (taskId) {
            return pendingTasks.indexOf(taskId) === -1;
        });

        user.name = name;
        user.email = email;
        user.pendingTasks = pendingTasks;
        await user.save();

        await Task.updateMany({ _id: { $in: removed }, assignedUser: id }, { assignedUser: '', assignedUserName: 'unassigned' });
        await User.updateMany({ _id: { $ne: user._id }, pendingTasks: { $in: pendingTasks } }, { $pull: { pendingTasks: { $in: pendingTasks } } });
        await Task.updateMany({ $or: [{ _id: { $in: pendingTasks } }, { assignedUser: id }] }, { assignedUser: id, assignedUserName: name });

        if (isNew) {
            send(res, 201, 'User created', user);
        } else {
            send(res, 200, 'User updated', user);
        }
    } catch (err) {
        if (err.code === 11000) {
            return send(res, 400, 'This email is already used by another user');
        }
        send(res, 500, 'Server error');
    }
}

async function findUser(req, res) {
    if (!helpers.isId(req.params.id)) {
        send(res, 404, 'User not found');
        return null;
    }
    var user = await User.findById(req.params.id);
    if (!user) {
        send(res, 404, 'User not found');
    }
    return user;
}

module.exports = function (router) {

    var usersRoute = router.route('/users');
    var userRoute = router.route('/users/:id');

    usersRoute.get(function (req, res) {
        return helpers.getList(User, req, res, 0);
    });

    usersRoute.post(function (req, res) {
        return saveUser(req, res, null);
    });

    userRoute.get(function (req, res) {
        return helpers.getOne(User, req, res, 'User not found');
    });

    userRoute.put(async function (req, res) {
        try {
            var user = await findUser(req, res);
            if (user) {
                await saveUser(req, res, user);
            }
        } catch (err) {
            send(res, 500, 'Server error');
        }
    });

    userRoute.delete(async function (req, res) {
        try {
            var user = await findUser(req, res);
            if (!user) {
                return;
            }
            await Task.updateMany({ assignedUser: user._id.toString() }, { assignedUser: '', assignedUserName: 'unassigned' });
            await User.deleteOne({ _id: user._id });
            send(res, 200, 'User deleted', user);
        } catch (err) {
            send(res, 500, 'Server error');
        }
    });

    return router;
};
