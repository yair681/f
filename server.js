const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); 

// --- SQL/Knex Setup ---
const knex = require('knex');
const knexConfig = {
    client: 'pg', // PostgreSQL driver
    connection: process.env.DATABASE_URL || 'postgres://localhost/school_db',
    useNullAsDefault: true,
    // *** תיקון 1: הוספת הגדרת SSL לחיבור Render ***
    ssl: {
        rejectUnauthorized: false
    }
};
const db = knex(knexConfig); 

const app = express();
const PORT = process.env.PORT || 3000; 
const saltRounds = 10;

// --- הגדרת Multer להעלאת קבצים ---
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// הגדרות express-session
app.use(session({
    secret: 'a-very-strong-secret-key-for-school',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: 'auto', 
        maxAge: 1000 * 60 * 60 * 24 
    }
}));


// --- פונקציות עזר ל-Postgres ---

// פונקציה לקבלת ה-ID הבא - עם תיקון לטיפול בתוצאות Knex/Postgres
async function getSequentialId(tableName, initialId = 1) {
    try {
        const result = await db(tableName).max('id as maxId').first();
        
        // *** תיקון 2: ודא שהתוצאה היא מספר שלם ולא אובייקט ***
        let maxId = result.maxId;
        // Knex יכול להחזיר את הערך בתוך שדה 'max' בתוך האובייקט
        if (typeof result.maxId === 'object' && result.maxId !== null && result.maxId.max !== undefined) {
             maxId = result.maxId.max; 
        } 
        
        return (maxId || initialId) + 1;
    } catch (e) {
        console.error(`שגיאה בשליפת ID עבור ${tableName}:`, e);
        return initialId;
    }
}

// --- הגדרת טבלאות ויצירת נתונים ראשוניים ---
async function setupDatabase() {
    console.log("בודק ומקים טבלאות PostgreSQL נדרשות...");
    
    // טבלת משתמשים (users)
    if (!await db.schema.hasTable('users')) {
        await db.schema.createTable('users', (table) => {
            table.increments('id').primary(); 
            table.string('fullname').notNullable();
            table.string('email').unique().notNullable();
            table.string('password').notNullable();
            table.string('role').defaultTo('student');
            table.specificType('classIds', 'integer ARRAY').defaultTo('{}'); 
            table.timestamps(true, true);
        });
        console.log("🛠️ טבלת 'users' נוצרה.");
        
        // נתוני דוגמה: יצירת משתמש אדמין ראשוני
        const adminPass = bcrypt.hashSync('yair12345', saltRounds);
        const teacherPass = bcrypt.hashSync('teacher123', saltRounds);
        const studentPass = bcrypt.hashSync('student123', saltRounds);
        
        await db('users').insert([
            { id: 1, fullname: "יאיר פריש", email: "yairfrish2@gmail.com", password: adminPass, role: "admin", classIds: [] },
            { id: 2, fullname: "מרים כהן", email: "teacher@school.com", password: teacherPass, role: "teacher", classIds: [101] },
            { id: 3, fullname: "דנה לוי", email: "student@school.com", password: studentPass, role: "student", classIds: [101] }
        ]);
        console.log("👤 משתמשים ראשוניים נוצרו.");
    }

    // טבלת כיתות (classes)
    if (!await db.schema.hasTable('classes')) {
        await db.schema.createTable('classes', (table) => {
            table.integer('id').primary(); 
            table.string('name').notNullable();
            table.string('grade');
            table.integer('teacherId').nullable(); 
            table.specificType('students', 'integer ARRAY').defaultTo('{3}'); 
            table.timestamps(true, true);
        });
        await db('classes').insert({ id: 101, name: "כיתה א'1", grade: "א", teacherId: 2, students: [3] });
        console.log("🛠️ טבלת 'classes' נוצרה.");
    }
    
    // טבלת פוסטים (posts)
    if (!await db.schema.hasTable('posts')) {
         await db.schema.createTable('posts', (table) => {
            table.integer('id').primary();
            table.string('title').notNullable();
            table.text('content').notNullable();
            table.integer('authorId').notNullable();
            table.string('authorName');
            table.timestamp('date').defaultTo(db.fn.now());
            table.boolean('isPrivate').defaultTo(false);
            table.integer('classId').nullable();
            table.timestamps(true, true);
        });
        await db('posts').insert([
            { id: 1, title: 'ברוכים הבאים לאתר', content: 'שנת לימודים מוצלחת ומהנה לכולם!', authorId: 1, authorName: "יאיר פריש", date: new Date(), isPrivate: false, classId: null },
            { id: 2, title: 'שיעורי בית בחשבון', content: 'נא להכין עמוד 10 בספר.', authorId: 2, authorName: "מרים כהן", date: new Date(), isPrivate: true, classId: 101 }
        ]);
        console.log("🛠️ טבלת 'posts' נוצרה.");
    }
    
    // טבלת מטלות (assignments)
    if (!await db.schema.hasTable('assignments')) {
         await db.schema.createTable('assignments', (table) => {
            table.integer('id').primary();
            table.string('title').notNullable();
            table.text('description');
            table.timestamp('dueDate').notNullable();
            table.integer('teacherId').notNullable();
            table.string('teacherName');
            table.integer('classId').notNullable();
            table.jsonb('submissions').defaultTo('[]'); 
            table.timestamps(true, true);
        });
        await db('assignments').insert({ id: 1, title: 'משימה בחשבון', description: 'לפתור את 10 התרגילים בעמוד 10.', dueDate: '2025-11-10', teacherId: 2, teacherName: "מרים כהן", classId: 101, submissions: [] });
        console.log("🛠️ טבלת 'assignments' נוצרה.");
    }

    console.log("✅ הגדרת מסד הנתונים הושלמה.");
}


// --- Middleware - אימות והרשאות ---

const isAuthenticated = async (req, res, next) => {
    if (req.session.userId) {
        try {
            const user = await db('users').where({ id: req.session.userId }).first();
            
            if (user) {
                const userSession = { ...user };
                delete userSession.password; 
                req.session.user = userSession;
                next();
            } else {
                req.session.destroy(() => res.status(401).json({ message: 'אינך מחובר. המשתמש לא נמצא.' }));
            }
        } catch (error) {
             console.error("❌ שגיאת DB ב-isAuthenticated:", error); 
             res.status(500).json({ message: 'שגיאת שרת פנימית.' });
        }
    } else {
        res.status(401).json({ message: 'אינך מחובר. יש להתחבר למערכת.' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'אין לך הרשאה לבצע פעולה זו.' });
    }
};

const isAdminOrTeacher = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'teacher')) {
        next();
    } else {
        res.status(403).json({ message: 'רק מנהלים או מורים רשאים לבצע פעולה זו.' });
    }
};

// --- API Endpoints ---

// Authentication
app.post('/api/login', async (req, res) => { 
    const { email, password } = req.body;
    
    try {
        const user = await db('users').where({ email }).first();
        
        if (user && bcrypt.compareSync(password, user.password)) {
            const userSession = { ...user };
            delete userSession.password;
            
            req.session.user = userSession;
            req.session.userId = user.id; 
            res.json(userSession);
        } else {
            res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
        }
    } catch (error) {
        console.error("❌ שגיאת DB ב-POST /api/login:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'ההתנתקות נכשלה.' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'התנתקת בהצלחה.' });
    });
});

app.get('/api/me', async (req, res) => { 
    if (req.session.userId) {
        try {
            const freshUser = await db('users').where({ id: req.session.userId }).first();
            
            if (freshUser) {
                const userSession = { ...freshUser };
                delete userSession.password;
                req.session.user = userSession;
                res.json(userSession);
            } else {
                req.session.destroy(() => {
                    res.json(null);
                });
            }
        } catch (error) {
            console.error("❌ שגיאת DB ב-GET /api/me:", error); 
            res.status(500).json({ message: 'שגיאת שרת פנימית.' });
        }
    } else {
        res.json(null);
    }
});

app.put('/api/profile', isAuthenticated, async (req, res) => { 
    const { fullname, email, password } = req.body;
    const userId = req.session.user.id;
    
    try {
        const user = await db('users').where({ id: userId }).first();

        if (!user) {
            return res.status(404).json({ message: 'משתמש לא נמצא.' });
        }
        
        // הגנה על המשתמש הראשי
        if (user.email === 'yairfrish2@gmail.com' && email !== 'yairfrish2@gmail.com') {
             return res.status(403).json({ message: 'לא ניתן לשנות את האימייל של משתמש זה.' });
        }

        // בדיקה אם האימייל החדש תפוס
        if (email !== user.email && await db('users').where({ email }).whereNot({ id: userId }).first()) {
            return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
        }
        
        const updateData = {};
        if (fullname) updateData.fullname = fullname;
        if (email) updateData.email = email;
        if (password) updateData.password = bcrypt.hashSync(password, saltRounds);

        await db('users').where({ id: userId }).update(updateData);
        
        const updatedUser = await db('users').where({ id: userId }).first();
        
        const userSession = { ...updatedUser };
        delete userSession.password;
        req.session.user = userSession; 
        
        res.json(userSession);
    } catch (error) {
        console.error("❌ שגיאת DB ב-PUT /api/profile:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Users Management (Admin/Teacher)
// *** תיקון 3: מאפשר גם למורים לגשת לרשימת המשתמשים הכללית ***
app.get('/api/users', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    try {
        const safeUsers = await db('users').select('id', 'fullname', 'email', 'role', 'classIds');
        res.json(safeUsers);
    } catch (error) {
        console.error("❌ שגיאת DB קריטית ב-GET /api/users:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

app.post('/api/users', isAuthenticated, isAdmin, async (req, res) => { 
    let { fullname, email, password, role, classIds } = req.body;
    
    if (!fullname || !email || !password || !role) {
        return res.status(400).json({ message: 'חסרים שדות חובה.' });
    }
    
    try {
        // בדיקת קיום אימייל
        if (await db('users').where({ email }).first()) {
            return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
        }
        
        const studentClassIds = (role === 'student' && classIds) ? classIds.map(Number) : [];
        
        const hashedPassword = bcrypt.hashSync(password, saltRounds);

        // *** תיקון 2: חילוץ ID נכון מ-Knex/Postgres ***
        const returnedId = await db('users').insert({
            fullname,
            email,
            password: hashedPassword,
            role,
            classIds: studentClassIds
        }).returning('id');
        
        // ודא שה-ID שולף בצורה תקינה, בין אם מדובר במערך של ערכים או אובייקטים
        const newUserId = (typeof returnedId[0] === 'object' && returnedId[0].id) 
            ? returnedId[0].id 
            : returnedId[0];
        // ***************************************************************
        
        const newUser = await db('users').where({ id: newUserId }).first();
        
        // הוספת תלמיד לכיתות 
        if (role === 'student' && studentClassIds.length > 0) {
            await db('classes')
                .whereIn('id', studentClassIds)
                .update({ students: db.raw('array_append(students, ?)', [newUserId]) });
        }
        
        const { password: pw, ...safeUser } = newUser;
        res.status(201).json(safeUser);
    } catch (error) {
        console.error("❌ שגיאה ביצירת משתמש:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// עריכת משתמש
app.put('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => { 
    const userId = parseInt(req.params.id);
    let { fullname, email, role, classIds, password } = req.body;
    
    try {
        const user = await db('users').where({ id: userId }).first();
        if (!user) {
            return res.status(404).json({ message: 'משתמש לא נמצא.' });
        }
        
        // הגנה על משתמש
        if (user.email === 'yairfrish2@gmail.com') {
            return res.status(403).json({ message: 'לא ניתן לערוך משתמש זה.' });
        }

        // בדיקת אימייל (אם השתנה)
        if (email !== user.email && await db('users').where({ email }).whereNot({ id: userId }).first()) {
             return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
        }
        
        const newClassIds = (role === 'student' && classIds) ? classIds.map(Number) : [];
        const updateData = {};
        if (fullname) updateData.fullname = fullname;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (classIds) updateData.classIds = newClassIds;
        if (password) updateData.password = bcrypt.hashSync(password, saltRounds);

        const oldClassIds = user.classIds || [];
        const added = newClassIds.filter(id => !oldClassIds.includes(id));
        const removed = oldClassIds.filter(id => !newClassIds.includes(id));

        // טיפול ב-Postgres: הוספה והסרה מהמערכים בטבלת classes
        if (added.length > 0) {
            await db('classes')
                .whereIn('id', added)
                .update({ students: db.raw('array_append(students, ?)', [userId]) });
        }
        if (removed.length > 0) {
            await db('classes')
                .whereIn('id', removed)
                .update({ students: db.raw('array_remove(students, ?)', [userId]) });
        }
        
        // עדכון פרטי משתמש
        await db('users').where({ id: userId }).update(updateData);
        
        const updatedUser = await db('users').where({ id: userId }).first();
        
        const { password: pw, ...safeUser } = updatedUser;
        res.json(safeUser);
    } catch (error) {
        console.error("❌ שגיאה בעריכת משתמש:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});


app.delete('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => { 
    const userId = parseInt(req.params.id);
    
    try {
        const user = await db('users').where({ id: userId }).first();
        if (!user) {
            return res.status(404).json({ message: 'משתמש לא נמצא.' });
        }
        
        // הגנה על משתמש
        if (user.email === 'yairfrish2@gmail.com') {
            return res.status(403).json({ message: 'לא ניתן למחוק משתמש זה.' });
        }
        
        // הסרת שיוך מהכיתות לפני המחיקה
        if (user.role === 'student' && user.classIds && user.classIds.length > 0) {
            await db('classes')
                .whereIn('id', user.classIds)
                .update({ students: db.raw('array_remove(students, ?)', [userId]) });
        }
        
        // מחיקת המשתמש
        await db('users').where({ id: userId }).del();
        
        res.json({ message: 'המשתמש נמחק בהצלחה.' });
    } catch (error) {
        console.error("❌ שגיאה במחיקת משתמש:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Classes Management
app.get('/api/classes', isAuthenticated, async (req, res) => { 
    try {
        const classes = await db('classes').select('*');
        res.json(classes);
    } catch (error) {
        console.error("❌ שגיאת DB ב-GET /api/classes:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// *** תיקון: מורה יוצר כיתה רק לעצמו ***
app.post('/api/classes', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const { name, grade, teacherId } = req.body;
    const user = req.session.user; // המשתמש המחובר
    
    try {
        const nextId = await getSequentialId('classes', 101); 
        
        let assignedTeacherId;
        
        if (user.role === 'admin') {
            // מנהל: יכול להגדיר מורה אחר (או null)
            assignedTeacherId = parseInt(teacherId) || null;
        } else if (user.role === 'teacher') {
            // מורה: חייב להיות מוגדר לעצמו. מתעלם מ-teacherId שהגיע ב-body.
            assignedTeacherId = user.id;
        } else {
             // הרשאה נכשלה (למרות ה-middleware)
             return res.status(403).json({ message: 'אין לך הרשאה ליצור כיתה.' });
        }
        

        const returnedId = await db('classes').insert({
            id: nextId,
            name,
            grade,
            teacherId: assignedTeacherId, // משתמש במזהה המורה שנקבע
            students: [] 
        }).returning('*');
        
        const newClass = (typeof returnedId[0] === 'object') 
            ? returnedId[0] 
            : returnedId; // כאן נחזיר את האובייקט המלא

        res.status(201).json(newClass);
    } catch (error) {
        console.error("❌ שגיאה ביצירת כיתה:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// מחיקת כיתה
app.delete('/api/classes/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const classId = parseInt(req.params.id);
    const user = req.session.user;
    
    try {
        const aClass = await db('classes').where({ id: classId }).first();
        if (!aClass) {
            return res.status(404).json({ message: 'כיתה לא נמצאה.' });
        }

        // בדיקת הרשאות
        if (user.role !== 'admin' && aClass.teacherId !== user.id) {
            return res.status(403).json({ message: 'רק מנהל או המורה המשויך לכיתה רשאים למחוק אותה.' });
        }

        // הסרת השיוך מהתלמידים (עדכון טבלת users)
        await db('users')
            .whereRaw('? = ANY("classIds")', [classId]) 
            .update({ classIds: db.raw('array_remove("classIds", ?)', [classId]) });

        // מחיקת הכיתה, כל הפוסטים והמטלות המשויכות
        await db('classes').where({ id: classId }).del();
        await db('posts').where({ classId: classId }).del();
        await db('assignments').where({ classId: classId }).del();

        res.json({ message: 'הכיתה, הפוסטים והמטלות נמחקו בהצלחה.' });
    } catch (error) {
        console.error("❌ שגיאה במחיקת כיתה:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// הוספת תלמידים לכיתה
app.post('/api/classes/:id/students', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const classId = parseInt(req.params.id);
    const { studentId } = req.body; 
    
    try {
        const aClass = await db('classes').where({ id: classId }).first();
        
        if (!aClass) {
            return res.status(404).json({ message: 'כיתה לא נמצאה.' });
        }

        // בדיקת הרשאות
        if (req.session.user.role !== 'admin' && aClass.teacherId !== req.session.user.id) {
            return res.status(403).json({ message: 'רק מנהל או המורה המשויך לכיתה רשאים להוסיף תלמידים.' });
        }

        const student = await db('users').where({ id: parseInt(studentId), role: 'student' }).first();
        
        if (!student) {
            return res.status(404).json({ message: 'תלמיד לא נמצא או שאינו תלמיד.' });
        }
        
        // הוספה לכיתה: רק אם התלמיד לא קיים כבר ברשימה
        if (!aClass.students.includes(student.id)) {
            await db('classes')
                .where({ id: classId })
                .update({ students: db.raw('array_append(students, ?)', [student.id]) });
        }
        
        // הוספה לרשימת הכיתות של התלמיד: רק אם הכיתה לא קיימת כבר ברשימה
        if (!student.classIds.includes(classId)) {
            await db('users')
                .where({ id: student.id })
                .update({ classIds: db.raw('array_append("classIds", ?)', [classId]) });
        }
        
        const updatedClass = await db('classes').where({ id: classId }).first();
        res.json(updatedClass);
    } catch (error) {
        console.error("❌ שגיאה בהוספת תלמיד לכיתה:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});


// Posts Management
app.get('/api/posts', isAuthenticated, async (req, res) => { 
    const user = req.session.user; 
    
    try {
        let query = db('posts').select('*').orderBy('date', 'desc');

        if (!user) {
            query = query.where({ isPrivate: false });
        } else if (user.role === 'admin') {
            // מנהל רואה הכל
        } else {
            // מורה ותלמיד רואים ציבוריות + כיתתיות שלהם
            const userClassIds = user.classIds || [];
            query = query.where({ isPrivate: false }).orWhereIn('classId', userClassIds);
        }
        
        const filteredPosts = await query;
        res.json(filteredPosts);
    } catch (error) {
        console.error("❌ שגיאת DB ב-GET /api/posts:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

app.post('/api/posts', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const { title, content, isPrivate, classId } = req.body;
    const author = req.session.user;
    
    try {
        const nextId = await getSequentialId('posts'); 

        const returnedId = await db('posts').insert({
            id: nextId,
            title,
            content,
            authorId: author.id,
            authorName: author.fullname,
            isPrivate: !!isPrivate,
            classId: isPrivate ? (parseInt(classId) || null) : null
        }).returning('*');

        const newPost = (typeof returnedId[0] === 'object') 
            ? returnedId[0] 
            : returnedId; 

        res.status(201).json(newPost);
    } catch (error) {
        console.error("❌ שגיאה ביצירת פוסט:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

app.delete('/api/posts/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const postId = parseInt(req.params.id);
    const user = req.session.user;
    
    try {
        const post = await db('posts').where({ id: postId }).first();
        if (!post) {
            return res.status(404).json({ message: 'הודעה לא נמצאה.' });
        }
        
        if (user.role === 'admin' || post.authorId === user.id) {
            await db('posts').where({ id: postId }).del();
            res.json({ message: 'ההודעה נמחקה.' });
        } else {
            res.status(403).json({ message: 'אין לך הרשאה למחוק הודעה זו.' });
        }
    } catch (error) {
        console.error("❌ שגיאה במחיקת פוסט:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Assignments Management
app.get('/api/assignments', isAuthenticated, async (req, res) => { 
    const user = req.session.user;
    
    try {
        if (user.role === 'admin') {
            return res.json(await db('assignments').select('*'));
        }
        
        if (user.role === 'teacher') {
            const teacherAssignments = await db('assignments').where({ teacherId: user.id }).select('*');
            return res.json(teacherAssignments);
        }
        
        if (user.role === 'student') {
            const userClassIds = user.classIds || [];
            const studentAssignments = await db('assignments').whereIn('classId', userClassIds).select('*');
            return res.json(studentAssignments);
        }
        
        res.json([]);
    } catch (error) {
        console.error("❌ שגיאת DB ב-GET /api/assignments:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const { title, description, dueDate, classId } = req.body;
    const teacher = req.session.user;
    
    if (!classId) {
        return res.status(400).json({ message: 'חובה לבחור כיתת יעד.' });
    }
    
    try {
        const nextId = await getSequentialId('assignments'); 

        const returnedId = await db('assignments').insert({
            id: nextId,
            title,
            description,
            dueDate,
            teacherId: teacher.id,
            teacherName: teacher.fullname,
            classId: parseInt(classId),
            submissions: []
        }).returning('*');

        const newAssignment = (typeof returnedId[0] === 'object') 
            ? returnedId[0] 
            : returnedId; 
        
        res.status(201).json(newAssignment);
    } catch (error) {
        console.error("❌ שגיאה ביצירת משימה:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('submissionFile'), async (req, res) => { 
    const assignmentId = parseInt(req.params.id);
    const student = req.session.user;
    
    if (student.role !== 'student') {
        if (req.file) fs.unlinkSync(req.file.path); 
        return res.status(403).json({ message: 'רק תלמידים יכולים להגיש משימות.' });
    }
    
    try {
        const assignment = await db('assignments').where({ id: assignmentId }).first();
        if (!assignment) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: 'משימה לא נמצאה.' });
        }
        
        if (!req.file) {
            return res.status(400).json({ message: 'לא נבחר קובץ להגשה.' });
        }

        let submissions = assignment.submissions || [];
        
        const newSubmission = {
            studentId: student.id,
            studentName: student.fullname,
            file: req.file, 
            date: new Date()
        };
        
        // יש לוודא ש-submissions הוא מערך לפני השימוש ב-findIndex.
        if (!Array.isArray(submissions)) {
             submissions = [];
        }
        
        const existingSubmissionIndex = submissions.findIndex(s => s.studentId === student.id);
        
        if (existingSubmissionIndex > -1) {
            const oldSubmission = submissions[existingSubmissionIndex];
            
            // *** התיקון הקריטי לשגיאת 500: בדיקה בטיחותית לפני מחיקת קובץ ישן ***
            if (oldSubmission && oldSubmission.file && oldSubmission.file.path) {
                const oldFilePath = oldSubmission.file.path;
                if (fs.existsSync(oldFilePath)) {
                    // מחיקת הקובץ הפיזי הישן
                    fs.unlinkSync(oldFilePath);
                }
            }
            // ***************************************************************
            
            // עדכון האובייקט החדש במקום הישן
            submissions[existingSubmissionIndex] = newSubmission;
        } else {
            submissions.push(newSubmission);
        }
        
        // --- עדכון submissions ב-DB ---
        await db('assignments').where({ id: assignmentId }).update({ submissions: submissions });

        res.json({ message: `המשימה הוגשה בהצלחה: ${req.file.filename}` });
    } catch (error) {
        console.error("❌ שגיאה בהגשת משימה:", error); 
        if (req.file) fs.unlinkSync(req.file.path); // מחיקת הקובץ אם ה-DB קרס
        res.status(500).json({ message: 'שגיאת שרת פנימית בהגשה.' });
    }
});

app.delete('/api/assignments/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => { 
    const assignmentId = parseInt(req.params.id);
    const user = req.session.user;
    
    try {
        const assignment = await db('assignments').where({ id: assignmentId }).first();

        if (!assignment) {
            return res.status(404).json({ message: 'משימה לא נמצאה.' });
        }

        if (user.role === 'admin' || assignment.teacherId === user.id) {
            try {
                let submissions = assignment.submissions || [];
                 // ודא ש-submissions הוא מערך לפני ה-forEach
                if (!Array.isArray(submissions)) {
                     submissions = [];
                }
                submissions.forEach(sub => {
                    if (sub.file && fs.existsSync(sub.file.path)) {
                        fs.unlinkSync(sub.file.path);
                    }
                });
            } catch (err) {
                console.error("❌ שגיאה במחיקת קבצי הגשה:", err);
            }
            
            // מחיקת המטלה
            await db('assignments').where({ id: assignmentId }).del();
            res.json({ message: 'המשימה וכל הגשותיה נמחקו בהצלחה.' });
        } else {
            res.status(403).json({ message: 'אין לך הרשאה למחוק משימה זו.' });
        }
    } catch (error) {
        console.error("❌ שגיאה במחיקת משימה:", error); 
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});


// --- הפעלת השרת ---
app.listen(PORT, async () => { 
    try {
        // בדיקת חיבור והקמת טבלאות
        await db.raw('SELECT 1'); 
        await setupDatabase(); 

        console.log(`✅ השרת מחובר ל-PostgreSQL בהצלחה.`);
        console.log(`🚀 השרת פועל בכתובת http://localhost:${PORT}`);
        console.log(`🔑 עמוד התחברות: http://localhost:${PORT}/login.html`);
        console.log(`🏠 עמוד ראשי: http://localhost:${PORT}/index.html`);
    } catch (error) {
        console.error("❌ שגיאה בחיבור ל-DB או בהפעלת השרת:", error); 
        process.exit(1);
    }
});
