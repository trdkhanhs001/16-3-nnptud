let reservationModel = require("../schemas/reservations");
let cartModel = require("../schemas/carts");
let inventoryModel = require("../schemas/inventories");
let productModel = require("../schemas/products");
let mongoose = require("mongoose");

module.exports = {
    // Lấy tất cả reservations của user
    getAllReservations: async function (userId) {
        return await reservationModel
            .find({
                user: userId,
                status: { $ne: 'cancelled' }
            })
            .populate({
                path: 'user',
                select: 'username email'
            })
            .populate({
                path: 'items.product',
                select: 'title price'
            })
            .sort({ createdAt: -1 });
    },

    // Lấy 1 reservation của user
    getReservationById: async function (userId, reservationId) {
        return await reservationModel
            .findOne({
                _id: reservationId,
                user: userId
            })
            .populate({
                path: 'user',
                select: 'username email'
            })
            .populate({
                path: 'items.product',
                select: 'title price images'
            });
    },

    // Reserve từ cart của user
    reserveACart: async function (userId, session) {
        // Lấy cart của user
        let cart = await cartModel.findOne({ user: userId }).session(session);
        if (!cart || cart.cartItems.length === 0) {
            throw new Error("Cart trống hoặc không tồn tại");
        }

        // Kiểm tra stock cho tất cả items
        for (let item of cart.cartItems) {
            let inventory = await inventoryModel.findOne({ product: item.product }).session(session);
            if (!inventory) {
                throw new Error(`Sản phẩm ${item.product} không tồn tại trong kho`);
            }

            let availableStock = inventory.stock - inventory.reserved;
            if (availableStock < item.quantity) {
                throw new Error(`Không đủ hàng cho sản phẩm. Có sẵn: ${availableStock}`);
            }
        }

        // Chuẩn bị reservation items
        let reservationItems = [];
        let totalAmount = 0;

        for (let item of cart.cartItems) {
            let product = await productModel.findById(item.product).session(session);
            let subtotal = product.price * item.quantity;

            reservationItems.push({
                product: item.product,
                quantity: item.quantity,
                title: product.title,
                price: product.price,
                subtotal: subtotal
            });

            totalAmount += subtotal;

            // Cập nhật inventory reserved
            await inventoryModel.findOneAndUpdate(
                { product: item.product },
                { $inc: { reserved: item.quantity } },
                { session }
            );
        }

        // Tạo reservation mới
        let expiredIn = new Date();
        expiredIn.setHours(expiredIn.getHours() + 24);

        let newReservation = new reservationModel({
            user: userId,
            items: reservationItems,
            amount: totalAmount,
            status: 'actived',
            expiredIn: expiredIn
        });

        await newReservation.save({ session });

        // Xóa cart items sau khi reserve thành công
        cart.cartItems = [];
        await cart.save({ session });

        return newReservation;
    },

    // Reserve các items cụ thể
    reserveItems: async function (userId, items, session) {
        // items: [{ product: id, quantity: qty }, ...]
        if (!items || items.length === 0) {
            throw new Error("Danh sách sản phẩm không hợp lệ");
        }

        // Kiểm tra stock cho tất cả items
        for (let item of items) {
            let inventory = await inventoryModel.findOne({ product: item.product }).session(session);
            if (!inventory) {
                throw new Error(`Sản phẩm ${item.product} không tồn tại trong kho`);
            }

            let availableStock = inventory.stock - inventory.reserved;
            if (availableStock < item.quantity) {
                throw new Error(`Không đủ hàng cho sản phẩm. Có sẵn: ${availableStock}`);
            }
        }

        // Chuẩn bị reservation items
        let reservationItems = [];
        let totalAmount = 0;

        for (let item of items) {
            let product = await productModel.findById(item.product).session(session);
            if (!product) {
                throw new Error(`Sản phẩm ${item.product} không tồn tại`);
            }

            let subtotal = product.price * item.quantity;

            reservationItems.push({
                product: item.product,
                quantity: item.quantity,
                title: product.title,
                price: product.price,
                subtotal: subtotal
            });

            totalAmount += subtotal;

            // Cập nhật inventory reserved
            await inventoryModel.findOneAndUpdate(
                { product: item.product },
                { $inc: { reserved: item.quantity } },
                { session }
            );
        }

        // Tạo reservation mới
        let expiredIn = new Date();
        expiredIn.setHours(expiredIn.getHours() + 24);

        let newReservation = new reservationModel({
            user: userId,
            items: reservationItems,
            amount: totalAmount,
            status: 'actived',
            expiredIn: expiredIn
        });

        await newReservation.save({ session });

        return newReservation;
    },

    // Hủy reservation (phải trong transaction)
    cancelReserve: async function (userId, reservationId, session) {
        let reservation = await reservationModel.findOne({
            _id: reservationId,
            user: userId
        }).session(session);

        if (!reservation) {
            throw new Error("Không tìm thấy reservation");
        }

        if (reservation.status !== 'actived') {
            throw new Error(`Không thể hủy reservation với status: ${reservation.status}`);
        }

        // Giảm inventory reserved
        for (let item of reservation.items) {
            await inventoryModel.findOneAndUpdate(
                { product: item.product },
                { $inc: { reserved: -item.quantity } },
                { session }
            );
        }

        // Cập nhật status thành cancelled
        reservation.status = 'cancelled';
        await reservation.save({ session });

        return reservation;
    }
};
