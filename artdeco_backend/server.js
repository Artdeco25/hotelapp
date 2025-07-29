// 1. Import required libraries
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const nodemailer = require('nodemailer');

// 2. Create an Express application
const app = express();
const port = 3000;

// 3. Use middleware
app.use(cors());
app.use(express.json());

// 4. Set up the database connection pool
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'artdeco apartments',
    password: 'Dilshani@2025', // SECURITY: For production, use environment variables for credentials
    port: 5432,
});

// 5. Set up the Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'artdec99o@gmail.com',
        pass: 'ayky tbrf arkg earz' // SECURITY: For production, use environment variables
    }
});

// Root route to test server
app.get('/', (req, res) => {
    res.send('ArtDeco backend server is running.');
});

// 6. API Endpoint to GET all rooms
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query('SELECT room_id, room_type, total_quantity FROM rooms');
        res.json(result.rows);
    } catch (err) {
        console.error("Room fetch error:", err);
        res.status(500).send('Server error');
    }
});

// 7. API Endpoint to POST a new booking
app.post('/api/bookings', async (req, res) => {
    try {
        const {
            arrivalDate,
            departureDate,
            adults,
            children,
            rooms,
            roomType,
            customer_name
        } = req.body;

        console.log("Received booking:", req.body);

        // --- Availability Check ---
        console.log('Checking room availability...');
        const roomQuery = await pool.query('SELECT room_id, total_quantity FROM rooms WHERE room_type = $1', [roomType]);

        if (roomQuery.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid room type specified.' });
        }

        const { room_id, total_quantity } = roomQuery.rows[0];
        const bookingQuery = await pool.query(
            `SELECT COALESCE(SUM(rooms_booked), 0) as total_booked
             FROM bookings
             WHERE room_id = $1 AND (arrival_date, departure_date) OVERLAPS (TO_DATE($2, 'YYYY-MM-DD'), TO_DATE($3, 'YYYY-MM-DD'))`,
            [room_id, arrivalDate, departureDate]
        );
        const total_booked = parseInt(bookingQuery.rows[0].total_booked, 10);
        const available_rooms = total_quantity - total_booked;

        if (rooms > available_rooms) {
            const message = available_rooms > 0
                ? `Sorry, only ${available_rooms} room(s) of this type are available.`
                : `Sorry, this room type is fully booked for these dates.`;
            return res.status(409).json({ message });
        }

        // --- Insert Booking ---
        const insertQuery = `
            INSERT INTO bookings (room_id, arrival_date, departure_date, rooms_booked, adults, children, customer_name)
            VALUES ($1, TO_DATE($2, 'YYYY-MM-DD'), TO_DATE($3, 'YYYY-MM-DD'), $4, $5, $6, $7) RETURNING *
        `;
        const newBookingResult = await pool.query(insertQuery, [room_id, arrivalDate, departureDate, rooms, adults, children, customer_name]);
        const newBooking = newBookingResult.rows[0];
        console.log('New booking inserted:', newBooking);

        // --- Prepare data for email ---
        const bookingId = newBooking.booking_id;

        const arrival = new Date(arrivalDate);
        const departure = new Date(departureDate);
        const totalNights = Math.round((departure - arrival) / (1000 * 60 * 60 * 24));

        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const arrivalDateFormatted = arrival.toLocaleDateString('en-US', dateOptions);
        const departureDateFormatted = departure.toLocaleDateString('en-US', dateOptions);

        const bookingTimestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });

        // --- Send Email ---
        const mailOptions = {
            from: '"ArtDeco Bookings" <artdec99o@gmail.com>',
            to: 'artdec99o@gmail.com',
            subject: `New Booking at ArtDeco: ${customer_name} for ${roomType}`,
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>New Booking Notification</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; background-color: #f4f4f4; }
                        .container { max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
                        .header { background-color: #2a2a2a; color: #ffffff; padding: 20px; text-align: center; }
                        .header h1 { margin: 0; font-size: 24px; }
                        .content { padding: 30px; }
                        .content h2 { color: #c8a379; font-size: 20px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-top: 0; }
                        .booking-details { width: 100%; border-collapse: collapse; }
                        .booking-details td { padding: 12px 0; border-bottom: 1px solid #eeeeee; font-size: 16px; }
                        .booking-details tr:last-child td { border-bottom: none; }
                        .booking-details .label { font-weight: bold; color: #555; width: 40%; }
                        .footer { background-color: #f9f9f9; text-align: center; padding: 20px; font-size: 12px; color: #777; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header"><h1>New Booking Notification</h1></div>
                        <div class="content">
                            <h2>Booking Confirmation Details</h2>
                            <p>A new booking has been confirmed via the website. Please see the details below and ensure preparations are made for the guest's arrival.</p>
                            <table class="booking-details">
                                <tr><td class="label">Booking ID:</td><td>${bookingId}</td></tr>
                                <tr><td class="label">Guest Name:</td><td>${customer_name}</td></tr>
                                <tr><td class="label">Room Type:</td><td>${roomType}</td></tr>
                                <tr><td class="label">Check-in:</td><td>${arrivalDateFormatted}</td></tr>
                                <tr><td class="label">Check-out:</td><td>${departureDateFormatted}</td></tr>
                                <tr><td class="label">Total Nights:</td><td>${totalNights}</td></tr>
                                <tr><td class="label">Guests:</td><td>${adults} Adults, ${children} Children</td></tr>
                                <tr><td class="label">Rooms Booked:</td><td>${rooms}</td></tr>
                                <tr><td class="label">Booking Time:</td><td>${bookingTimestamp} (Sri Lanka Time)</td></tr>
                            </table>
                        </div>
                        <div class="footer"><p>This is an automated notification from the ArtDeco Apartment Booking System.</p></div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('✅ Confirmation email sent successfully.');
        } catch (emailErr) {
            console.error("❌ Email sending error:", emailErr);
        }

        res.status(201).json({
            message: 'Booking successful! A confirmation has been sent.',
            // --- FIX: Changed newBooking.rows[0] to just newBooking ---
            bookingDetails: newBooking
        });

    } catch (err) {
        console.error("❌ Booking Error:", err);
        res.status(500).json({ message: 'Server error during the booking process.', error: err.message });
    }
});
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        console.log('Received contact form submission:', req.body);

        // Basic validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        // Prepare the email for the owner
        const mailOptions = {
            from: '"ArtDeco Contact Form" <artdec99o@gmail.com>',
            to: 'artdec99o@gmail.com', // This is your email address
            replyTo: email, // This allows you to directly reply to the user
            subject: `New Contact Message: ${subject}`,
            html: `
                <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
                    <h2>New Message from your Website Contact Form</h2>
                    <p>You have received a new message from a visitor. Here are the details:</p>
                    <hr>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong></p>
                    <blockquote style="border-left: 4px solid #ccc; padding-left: 16px; margin: 0;">
                        <p>${message.replace(/\n/g, "<br>")}</p>
                    </blockquote>
                    <hr>
                    <p style="font-size: 12px; color: #777;">This email was sent from the contact form on your ArtDeco Apartments website at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}.</p>
                </div>
            `
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        console.log(`✅ Contact email from ${name} sent successfully.`);

        res.status(200).json({ message: 'Your message has been sent successfully!' });

    } catch (error) {
        console.error("❌ Contact form submission error:", error);
        res.status(500).json({ message: 'Sorry, something went wrong on our end.' });
    }
});
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        console.log('Received contact form submission:', req.body);

        // Basic validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        // Prepare the email for the owner
        const mailOptions = {
            from: '"ArtDeco Contact Form" <artdec99o@gmail.com>',
            to: 'artdec99o@gmail.com', // This is your email address
            replyTo: email, // This allows you to directly reply to the user
            subject: `New Contact Message: ${subject}`,
            html: `
                <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
                    <h2>New Message from your Website Contact Form</h2>
                    <p>You have received a new message from a visitor. Here are the details:</p>
                    <hr>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong></p>
                    <blockquote style="border-left: 4px solid #ccc; padding-left: 16px; margin: 0;">
                        <p>${message.replace(/\n/g, "<br>")}</p>
                    </blockquote>
                    <hr>
                    <p style="font-size: 12px; color: #777;">This email was sent from the contact form on your ArtDeco Apartments website at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}.</p>
                </div>
            `
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        console.log(`✅ Contact email from ${name} sent successfully.`);

        res.status(200).json({ message: 'Your message has been sent successfully!' });

    } catch (error) {
        console.error("❌ Contact form submission error:", error);
        res.status(500).json({ message: 'Sorry, something went wrong on our end.' });
    }
});

// ✅ 8. Start the server
app.listen(port, () => {
    console.log(`🚀 ArtDeco backend server is running at http://localhost:${port}`);
});
