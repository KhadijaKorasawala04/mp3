var User = require('../models/user');
var Task = require('../models/task');
var helpers = require('./helpers');

var send = helpers.send;

function toDate(value) {
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        value = Number(value);
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

async function saveTask(req, res, task) {
    var body = req.body || {};
    var name = body.name;
    var description = body.description;
    var completed = body.completed;
    var assignedUser = body.assignedUser;
    var assignedUserName = body.assignedUserName;

    if (typeof name !== 'string' || name.trim() === '') {
        return send(res, 400, 'Task name is required');
    }
    if (body.deadline === undefined || body.deadline === null || body.deadline === '') {
        return send(res, 400, 'Task deadline is required');
    }
    var deadline = toDate(body.deadline);
    if (!deadline) {
        return send(res, 400, 'Task deadline must be a valid date');
    }
    if (description === undefined || description === null) {
        description = '';
    }
    if (typeof description !== 'string') {
        return send(res, 400, 'description must be a string');
    }
    if (completed === undefined || completed === null) {
        completed = false;
    }
    if (completed === 'true' || completed === 'false') {
        completed = completed === 'true';
    }
    if (typeof completed !== 'boolean') {
        return send(res, 400, 'completed must be true or false');
    }
    if (assignedUser === undefined || assignedUser === null) {
        assignedUser = '';
    }
    if (typeof assignedUser !== 'string' || (assignedUser !== '' && !helpers.isId(assignedUser))) {
        return send(res, 400, 'assignedUser is not a valid user id');
    }
    if (assignedUserName === null || assignedUserName === '') {
        assignedUserName = undefined;
    }
    if (assignedUserName !== undefined && typeof assignedUserName !== 'string') {
        return send(res, 400, 'assignedUserName must be a string');
    }

    try {
        if (assignedUser === '') {
            if (assignedUserName !== undefined && assignedUserName !== 'unassigned') {
                return send(res, 400, 'assignedUserName does not match assignedUser');
            }
            assignedUserName = 'unassigned';
        } else {
            var user = await User.findById(assignedUser);
            if (!user) {
                return send(res, 404, 'Assigned user not found');
            }
            if (assignedUserName !== undefined && assignedUserName !== user.name) {
                return send(res, 400, 'assignedUserName does not match assignedUser');
            }
            assignedUserName = user.name;
        }

        var isNew = !task;
        if (isNew) {
            task = new Task();
        }
        var id = task._id.toString();

        task.name = name;
        task.description = description;
        task.deadline = deadline;
        task.completed = completed;
        task.assignedUser = assignedUser;
        task.assignedUserName = assignedUserName;
        await task.save();

        if (assignedUser !== '' && !completed) {
            await User.updateMany({ _id: { $ne: assignedUser }, pendingTasks: id }, { $pull: { pendingTasks: id } });
            await User.updateOne({ _id: assignedUser }, { $addToSet: { pendingTasks: id } });
        } else {
            await User.updateMany({ pendingTasks: id }, { $pull: { pendingTasks: id } });
        }

        if (isNew) {
            send(res, 201, 'Task created', task);
        } else {
            send(res, 200, 'Task updated', task);
        }
    } catch (err) {
        send(res, 500, 'Server error');
    }
}

async function findTask(req, res) {
    if (!helpers.isId(req.params.id)) {
        send(res, 404, 'Task not found');
        return null;
    }
    var task = await Task.findById(req.params.id);
    if (!task) {
        send(res, 404, 'Task not found');
    }
    return task;
}

module.exports = function (router) {

    var tasksRoute = router.route('/tasks');
    var taskRoute = router.route('/tasks/:id');

    tasksRoute.get(function (req, res) {
        return helpers.getList(Task, req, res, 100);
    });

    tasksRoute.post(function (req, res) {
        return saveTask(req, res, null);
    });

    taskRoute.get(function (req, res) {
        return helpers.getOne(Task, req, res, 'Task not found');
    });

    taskRoute.put(async function (req, res) {
        try {
            var task = await findTask(req, res);
            if (task) {
                await saveTask(req, res, task);
            }
        } catch (err) {
            send(res, 500, 'Server error');
        }
    });

    taskRoute.delete(async function (req, res) {
        try {
            var task = await findTask(req, res);
            if (!task) {
                return;
            }
            var id = task._id.toString();
            await User.updateMany({ pendingTasks: id }, { $pull: { pendingTasks: id } });
            await Task.deleteOne({ _id: task._id });
            send(res, 200, 'Task deleted', task);
        } catch (err) {
            send(res, 500, 'Server error');
        }
    });

    return router;
};
