var express = require("express");
var router = express.Router();
let { checkLogin } = require('../utils/authHandler')
let reservationController = require('../controllers/reservations')
let mongoose = require('mongoose')

// GET /reservations - Lấy tất cả reservations của user
router.get('/', checkLogin, async function (req, res, next) {
    try {
        let reservations = await reservationController.getAllReservations(req.userId);
        res.status(200).send({
            message: "Lấy danh sách reservations thành công",
            data: reservations
        });
    } catch (error) {
        res.status(500).send({
            message: "Lỗi khi lấy danh sách reservations",
            error: error.message
        });
    }
});

// GET /reservations/:id - Lấy 1 reservation của user
router.get('/:id', checkLogin, async function (req, res, next) {
    try {
        let reservation = await reservationController.getReservationById(req.userId, req.params.id);
        if (!reservation) {
            return res.status(404).send({
                message: "Không tìm thấy reservation"
            });
        }
        res.status(200).send({
            message: "Lấy reservation thành công",
            data: reservation
        });
    } catch (error) {
        res.status(500).send({
            message: "Lỗi khi lấy reservation",
            error: error.message
        });
    }
});

// POST /reserveACart - Reserve từ cart của user
router.post('/reserveACart', checkLogin, async function (req, res, next) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        let newReservation = await reservationController.reserveACart(req.userId, session);
        await session.commitTransaction();
        
        res.status(201).send({
            message: "Reserve từ cart thành công",
            data: newReservation
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).send({
            message: "Lỗi khi reserve từ cart",
            error: error.message
        });
    } finally {
        session.endSession();
    }
});

// POST /reserveItems - Reserve các items cụ thể
// Body: { items: [{ product: id, quantity: qty }, ...] }
router.post('/reserveItems', checkLogin, async function (req, res, next) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        let { items } = req.body;
        
        if (!items || !Array.isArray(items)) {
            await session.abortTransaction();
            return res.status(400).send({
                message: "Body phải chứa items là một mảng"
            });
        }

        let newReservation = await reservationController.reserveItems(req.userId, items, session);
        await session.commitTransaction();
        
        res.status(201).send({
            message: "Reserve items thành công",
            data: newReservation
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).send({
            message: "Lỗi khi reserve items",
            error: error.message
        });
    } finally {
        session.endSession();
    }
});

// POST /cancelReserve/:id - Hủy reservation (trong transaction)
router.post('/cancelReserve/:id', checkLogin, async function (req, res, next) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        let cancelledReservation = await reservationController.cancelReserve(req.userId, req.params.id, session);
        await session.commitTransaction();
        
        res.status(200).send({
            message: "Hủy reservation thành công",
            data: cancelledReservation
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).send({
            message: "Lỗi khi hủy reservation",
            error: error.message
        });
    } finally {
        session.endSession();
    }
});

module.exports = router;
