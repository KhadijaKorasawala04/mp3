function send(res, status, message, data) {
    res.status(status).json({ message: message, data: data === undefined ? {} : data });
}

function isId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function parse(value) {
    if (value === undefined) {
        return undefined;
    }
    return JSON.parse(value);
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function queryError(res, err) {
    if (err.name === 'CastError' || err.name === 'MongoServerError') {
        return send(res, 400, 'Invalid query');
    }
    send(res, 500, 'Server error');
}

async function getList(Model, req, res, defaultLimit) {
    var where, sort, select, skip, limit, count;
    try {
        where = parse(req.query.where);
        sort = parse(req.query.sort);
        select = parse(req.query.select || req.query.filter);
        skip = parse(req.query.skip);
        limit = parse(req.query.limit);
        count = parse(req.query.count);
    } catch (err) {
        return send(res, 400, 'Query parameters must be valid JSON');
    }

    if (where === undefined) {
        where = {};
    }
    if (!isObject(where) || (sort !== undefined && !isObject(sort)) || (select !== undefined && !isObject(select))) {
        return send(res, 400, 'where, sort and select must be JSON objects');
    }
    if ((skip !== undefined && !isCount(skip)) || (limit !== undefined && !isCount(limit))) {
        return send(res, 400, 'skip and limit must be non-negative numbers');
    }

    try {
        if (count === true || count === 'true') {
            var countQuery = Model.countDocuments(where);
            if (skip !== undefined) countQuery.skip(skip);
            if (limit !== undefined) countQuery.limit(limit);
            return send(res, 200, 'OK', await countQuery);
        }

        var query = Model.find(where);
        if (sort !== undefined) query.sort(sort);
        if (select !== undefined) query.select(select);
        if (skip !== undefined) query.skip(skip);
        if (limit !== undefined) {
            query.limit(limit);
        } else if (defaultLimit) {
            query.limit(defaultLimit);
        }
        send(res, 200, 'OK', await query);
    } catch (err) {
        queryError(res, err);
    }
}

async function getOne(Model, req, res, notFound) {
    var select;
    try {
        select = parse(req.query.select || req.query.filter);
    } catch (err) {
        return send(res, 400, 'select must be valid JSON');
    }
    if (select !== undefined && !isObject(select)) {
        return send(res, 400, 'select must be a JSON object');
    }
    if (!isId(req.params.id)) {
        return send(res, 404, notFound);
    }

    try {
        var query = Model.findById(req.params.id);
        if (select !== undefined) query.select(select);
        var doc = await query;
        if (!doc) {
            return send(res, 404, notFound);
        }
        send(res, 200, 'OK', doc);
    } catch (err) {
        queryError(res, err);
    }
}

module.exports = { send: send, isId: isId, getList: getList, getOne: getOne };
