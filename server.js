const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer'); // לטיפול בהעלאת קבצים
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const saltRounds = 10;
const DB_PATH = path.join(__dirname, 'db.json');

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
        // שומר את הקובץ עם שם ייחודי (חותמת זמן + שם מקורי)
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(express.json()); // לקבלת גוף בקשה בפורמט JSON
app.use(express.urlencoded({ extended: true })); // לפענוח גוף בקשה
app.use(express.static('public')); // הגשת קבצים סטטיים מתיקיית 'public'
// הגשת קבצים שהועלו (לצורך צפייה בהגשות)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// הגדרות express-session
app.use(session({
    secret: 'a-very-strong-secret-key-for-school',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // בסביבת פיתוח. ב-production יש להגדיר true (דורש HTTPS)
        maxAge: 1000 * 60 * 60 * 24 // 24 שעות
    }
}));

// --- בסיס נתונים (JSON File) ---

let db = {
    users: [],
    classes: [],
    posts: [],
    assignments: []
};

function loadDb() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf-8');
            db = JSON.parse(data);
            console.log("מסד הנתונים נטען בהצלחה.");
        } else {
            // נתוני דוגמה אם הקובץ לא קיים
            const adminPass = bcrypt.hashSync('yair12345', saltRounds);
            const teacherPass = bcrypt.hashSync('teacher123', saltRounds);
            const studentPass = bcrypt.hashSync('student123', saltRounds);
            
            db.users = [
                { id: 1, fullname: "יאיר פריש", email: "yairfrish2@gmail.com", password: adminPass, role: "admin", classIds: [] },
                { id: 2, fullname: "מרים כהן", email: "teacher@school.com", password: teacherPass, role: "teacher", classIds: [101] },
                { id: 3, fullname: "דנה לוי", email: "student@school.com", password: studentPass, role: "student", classIds: [101] }
            ];
            db.classes = [
                { id: 101, name: "כיתה א'1", grade: "א", teacherId: 2, students: [3] }
            ];
            db.posts = [
                { id: 1, title: 'ברוכים הבאים לאתר', content: 'שנת לימודים מוצלחת ומהנה לכולם!', authorId: 1, authorName: "יאיר פריש", date: new Date(), isPrivate: false, classId: null },
                { id: 2, title: 'שיעורי בית בחשבון', content: 'נא להכין עמוד 10 בספר.', authorId: 2, authorName: "מרים כהן", date: new Date(), isPrivate: true, classId: 101 }
            ];
            db.assignments = [
                { id: 1, title: 'משימה בחשבון', description: 'לפתור את 10 התרגילים בעמוד 10.', dueDate: '2025-11-10', teacherId: 2, teacherName: "מרים כהן", classId: 101, submissions: [] }
            ];
            
            saveDb();
            console.log("מסד נתונים חדש נוצר עם נתוני דוגמה.");
        }
    } catch (error) {
        console.error("שגיאה בטעינת מסד הנתונים:", error);
        process.exit(1); // עצירת השרת אם אי אפשר לטעון DB
    }
}

function saveDb() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    } catch (error) {
        console.error("שגיאה בשמירת מסד הנתונים:", error);
    }
}

// פונקציה לקבלת ה-ID הבא
const getNextId = (collection) => {
    if (collection.length === 0) return 1;
    return Math.max(...collection.map(item => item.id)) + 1;
};


// --- Middleware - אימות והרשאות ---
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
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
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    
    if (user && bcrypt.compareSync(password, user.password)) {
        const userSession = { ...user };
        delete userSession.password;
        
        req.session.user = userSession;
        res.json(userSession);
    } else {
        res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
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

app.get('/api/me', (req, res) => {
    if (req.session.user) {
        // רענון המידע מה-DB (למקרה שמשתמש אחר ערך אותו)
        const freshUser = db.users.find(u => u.id === req.session.user.id);
        if (freshUser) {
            const userSession = { ...freshUser };
            delete userSession.password;
            req.session.user = userSession;
            res.json(userSession);
        } else {
            // המשתמש נמחק מה-DB, נתק אותו
            req.session.destroy(() => {
                res.json(null);
            });
        }
    } else {
        res.json(null);
    }
});

app.put('/api/profile', isAuthenticated, (req, res) => {
    const { fullname, email, password } = req.body;
    const userId = req.session.user.id;
    
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    // הגנה על המשתמש הראשי
    if (db.users[userIndex].email === 'yairfrish2@gmail.com' && email !== 'yairfrish2@gmail.com') {
         return res.status(403).json({ message: 'לא ניתן לשנות את האימייל של משתמש זה.' });
    }

    // בדיקה אם האימייל החדש תפוס
    if (email !== db.users[userIndex].email && db.users.some(u => u.email === email)) {
        return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const user = db.users[userIndex];
    user.fullname = fullname || user.fullname;
    user.email = email || user.email;
    
    if (password) {
        user.password = bcrypt.hashSync(password, saltRounds);
    }
    
    saveDb(); // שמירת השינויים
    
    const userSession = { ...user };
    delete userSession.password;
    req.session.user = userSession; // עדכון הסשן
    
    res.json(userSession);
});

// Users Management (Admin)
app.get('/api/users', isAuthenticated, isAdmin, (req, res) => {
    const safeUsers = db.users.map(u => {
        const { password, ...safeUser } = u;
        return safeUser;
    });
    res.json(safeUsers);
});

app.post('/api/users', isAuthenticated, isAdmin, (req, res) => {
    let { fullname, email, password, role, classIds } = req.body;
    
    if (!fullname || !email || !password || !role) {
        return res.status(400).json({ message: 'חסרים שדות חובה.' });
    }
    
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const studentClassIds = (role === 'student' && classIds) ? classIds.map(Number) : [];
    
    if (studentClassIds.length > 10) {
        return res.status(400).json({ message: 'לא ניתן לשייך תלמיד ליותר מ-10 כיתות.' });
    }

    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const newUser = {
        id: getNextId(db.users),
        fullname,
        email,
        password: hashedPassword,
        role,
        classIds: studentClassIds
    };
    
    db.users.push(newUser);
    
    // הוספת תלמיד לכיתות
    if (role === 'student') {
        studentClassIds.forEach(classId => {
            const aClass = db.classes.find(c => c.id === classId);
            if (aClass && !aClass.students.includes(newUser.id)) {
                aClass.students.push(newUser.id);
            }
        });
    }
    
    saveDb();
    
    const { password: pw, ...safeUser } = newUser;
    res.status(201).json(safeUser);
});

// (חדש) עריכת משתמש
app.put('/api/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    let { fullname, email, role, classIds, password } = req.body;

    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    const user = db.users[userIndex];
    
    // (חדש) הגנה על משתמש
    if (user.email === 'yairfrish2@gmail.com') {
        return res.status(403).json({ message: 'לא ניתן לערוך משתמש זה.' });
    }

    // בדיקת אימייל (אם השתנה)
    if (email !== user.email && db.users.some(u => u.email === email)) {
         return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const newClassIds = (role === 'student' && classIds) ? classIds.map(Number) : [];
    
    if (newClassIds.length > 10) {
        return res.status(400).json({ message: 'לא ניתן לשייך תלמיד ליותר מ-10 כיתות.' });
    }
    
    // עדכון שיוך כיתות
    const oldClassIds = user.classIds || [];
    const added = newClassIds.filter(id => !oldClassIds.includes(id));
    const removed = oldClassIds.filter(id => !newClassIds.includes(id));

    added.forEach(classId => {
        const aClass = db.classes.find(c => c.id === classId);
        if (aClass && !aClass.students.includes(userId)) {
            aClass.students.push(userId);
        }
    });

    removed.forEach(classId => {
        const aClass = db.classes.find(c => c.id === classId);
        if (aClass) {
            aClass.students = aClass.students.filter(sid => sid !== userId);
        }
    });
    
    // עדכון פרטי משתמש
    user.fullname = fullname || user.fullname;
    user.email = email || user.email;
    user.role = role || user.role;
    user.classIds = newClassIds;
    if (password) {
        user.password = bcrypt.hashSync(password, saltRounds);
    }
    
    saveDb();
    
    const { password: pw, ...safeUser } = user;
    res.json(safeUser);
});


app.delete('/api/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    const deletedUser = db.users[userIndex];

    // (חדש) הגנה על משתמש
    if (deletedUser.email === 'yairfrish2@gmail.com') {
        return res.status(403).json({ message: 'לא ניתן למחוק משתמש זה.' });
    }
    
    db.users.splice(userIndex, 1);
    
    // הסרת תלמיד מכיתות
    if (deletedUser.role === 'student' && deletedUser.classIds) {
        deletedUser.classIds.forEach(classId => {
            const aClass = db.classes.find(c => c.id === classId);
            if (aClass) {
                aClass.students = aClass.students.filter(studentId => studentId !== userId);
            }
        });
    }
    
    saveDb();
    res.json({ message: 'המשתמש נמחק בהצלחה.' });
});

// Classes Management
app.get('/api/classes', (req, res) => {
    res.json(db.classes);
});

// *** תיקון: מורה יוצר כיתה רק לעצמו (מהשיחה הקודמת) ***
app.post('/api/classes', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { name, grade, teacherId } = req.body;
    const user = req.session.user; // המשתמש המחובר

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
    
    const newClass = {
        id: getNextId(db.classes),
        name,
        grade,
        teacherId: assignedTeacherId, // משתמש במזהה המורה שנקבע
        students: []
    };
    
    db.classes.push(newClass);
    saveDb();
    res.status(201).json(newClass);
});

// (חדש) מחיקת כיתה
app.delete('/api/classes/:id', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const classId = parseInt(req.params.id);
    
    const classIndex = db.classes.findIndex(c => c.id === classId);
    if (classIndex === -1) {
        return res.status(404).json({ message: 'כיתה לא נמצאה.' });
    }

    // (אופציונלי - רק מנהל או המורה *המשויך* יכולים למחוק)
    const aClass = db.classes[classIndex];
    if (req.session.user.role !== 'admin' && aClass.teacherId !== req.session.user.id) {
        return res.status(403).json({ message: 'רק מנהל או המורה המשויך לכיתה רשאים למחוק אותה.' });
    }

    db.classes.splice(classIndex, 1);

    // הסרת השיוך מהתלמידים
    db.users.forEach(user => {
        if (user.role === 'student' && user.classIds) {
            user.classIds = user.classIds.filter(cid => cid !== classId);
        }
    });

    saveDb();
    res.json({ message: 'הכיתה נמחקה בהצלחה.' });
});


// *** שינוי כאן: API להוספת תלמידים לכיתה, למנהלים או למורה של הכיתה ***
app.post('/api/classes/:id/students', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const classId = parseInt(req.params.id);
    const { studentId } = req.body; // נצפה לקבל studentId
    
    const aClass = db.classes.find(c => c.id === classId);
    
    if (!aClass) {
        return res.status(404).json({ message: 'כיתה לא נמצאה.' });
    }

    // (חדש) בדיקת הרשאות: או מנהל, או המורה המשויך לכיתה
    if (req.session.user.role !== 'admin' && aClass.teacherId !== req.session.user.id) {
        return res.status(403).json({ message: 'רק מנהל או המורה המשויך לכיתה רשאים להוסיף תלמידים.' });
    }

    const student = db.users.find(u => u.id === parseInt(studentId) && u.role === 'student');
    
    if (!student) {
        return res.status(404).json({ message: 'תלמיד לא נמצא או שאינו תלמיד.' });
    }
    
    // הוספה לכיתה חדשה
    if (!aClass.students.includes(student.id)) {
        aClass.students.push(student.id);
    }
    // הוספה לרשימת הכיתות של התלמיד
    if (!student.classIds.includes(classId)) {
        student.classIds.push(classId);
    }
    
    saveDb();
    res.json(aClass);
});


// Posts Management
app.get('/api/posts', (req, res) => {
    const user = req.session.user; // יכול להיות null
    
    if (!user) {
        return res.json(db.posts.filter(p => !p.isPrivate));
    }
    
    if (user.role === 'admin') {
        return res.json(db.posts); // מנהל רואה הכל
    }
    
    // מורה ותלמיד רואים הודעות ציבוריות + הודעות כיתתיות
    const userClassIds = user.classIds || [];
    const filteredPosts = db.posts.filter(post => 
        !post.isPrivate || userClassIds.includes(post.classId)
    );
    
    res.json(filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/posts', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { title, content, isPrivate, classId } = req.body;
    const author = req.session.user;
    
    const newPost = {
        id: getNextId(db.posts),
        title,
        content,
        authorId: author.id,
        authorName: author.fullname,
        date: new Date(),
        isPrivate: !!isPrivate,
        // *** שינוי כאן: אם פרטי, השתמש בכיתה שנבחרה. ה-fallback הוסר ***
        classId: isPrivate ? (parseInt(classId) || null) : null
    };
    
    db.posts.push(newPost);
    saveDb();
    res.status(201).json(newPost);
});

app.delete('/api/posts/:id', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const postId = parseInt(req.params.id);
    const user = req.session.user;
    
    const postIndex = db.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ message: 'הודעה לא נמצאה.' });
    }
    
    if (user.role === 'admin' || db.posts[postIndex].authorId === user.id) {
        db.posts.splice(postIndex, 1);
        saveDb();
        res.json({ message: 'ההודעה נמחקה.' });
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק הודעה זו.' });
    }
});

// Assignments Management
app.get('/api/assignments', (req, res) => {
    const user = req.session.user;
    
    if (!user) {
        return res.json([]); 
    }
    
    if (user.role === 'admin') {
        return res.json(db.assignments); // מנהל רואה הכל
    }
    
    if (user.role === 'teacher') {
        // מורה רואה משימות שהוא יצר + משימות לכיתות שהוא משויך אליהן (אם רוצים)
        const teacherAssignments = db.assignments.filter(a => a.teacherId === user.id);
        return res.json(teacherAssignments);
    }
    
    if (user.role === 'student') {
        const userClassIds = user.classIds || [];
        // תלמיד רואה משימות של הכיתות שלו
        const studentAssignments = db.assignments.filter(a => userClassIds.includes(a.classId));
        return res.json(studentAssignments);
    }
});

app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { title, description, dueDate, classId } = req.body;
    const teacher = req.session.user;
    
    if (!classId) {
        return res.status(400).json({ message: 'חובה לבחור כיתת יעד.' });
    }
    
    const newAssignment = {
        id: getNextId(db.assignments),
        title,
        description,
        dueDate,
        teacherId: teacher.id,
        teacherName: teacher.fullname,
        classId: parseInt(classId),
        submissions: []
    };
    
    db.assignments.push(newAssignment);
    saveDb();
    res.status(201).json(newAssignment);
});

app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('submissionFile'), (req, res) => {
    const assignmentId = parseInt(req.params.id);
    const student = req.session.user;
    
    if (student.role !== 'student') {
        // ודא שמחיקת הקובץ מתבצעת אם יש שגיאת הרשאה
        if (req.file) fs.unlinkSync(req.file.path); 
        return res.status(403).json({ message: 'רק תלמידים יכולים להגיש משימות.' });
    }
    
    const assignment = db.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: 'משימה לא נמצאה.' });
    }
    
    if (!req.file) {
        return res.status(400).json({ message: 'לא נבחר קובץ להגשה.' });
    }
    
    const newSubmission = {
        studentId: student.id,
        studentName: student.fullname,
        file: req.file, 
        date: new Date()
    };
    
    const existingSubmissionIndex = assignment.submissions.findIndex(s => s.studentId === student.id);
    if (existingSubmissionIndex > -1) {
        const oldSubmission = assignment.submissions[existingSubmissionIndex];
        
        // *** התיקון הקריטי: בדיקה בטיחותית לפני מחיקת קובץ ישן ***
        if (oldSubmission.file && oldSubmission.file.path) {
            const oldFile = oldSubmission.file.path;
            if (fs.existsSync(oldFile)) {
                fs.unlinkSync(oldFile); // מחיקת הקובץ הפיזי הישן
            }
        }
        // ***************************************************************
        
        assignment.submissions[existingSubmissionIndex] = newSubmission;
    } else {
        assignment.submissions.push(newSubmission);
    }
    
    saveDb();
    res.json({ message: `המשימה הוגשה בהצלחה: ${req.file.filename}` });
});

app.delete('/api/assignments/:id', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const assignmentId = parseInt(req.params.id);
    const user = req.session.user;

    const assignmentIndex = db.assignments.findIndex(a => a.id === assignmentId);

    if (assignmentIndex === -1) {
        return res.status(404).json({ message: 'משימה לא נמצאה.' });
    }

    const assignment = db.assignments[assignmentIndex];

    if (user.role === 'admin' || assignment.teacherId === user.id) {
        try {
            assignment.submissions.forEach(sub => {
                // בדיקה בטיחותית לפני מחיקת הקובץ
                if (sub.file && sub.file.path && fs.existsSync(sub.file.path)) {
                    fs.unlinkSync(sub.file.path);
                }
            });
        } catch (err) {
            console.error("שגיאה במחיקת קבצי הגשה:", err);
        }
        
        db.assignments.splice(assignmentIndex, 1);
        saveDb();
        res.json({ message: 'המשימה וכל הגשותיה נמחקו בהצלחה.' });
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק משימה זו.' });
    }
});

// --- הפעלת השרת ---
app.listen(PORT, () => {
    loadDb(); // טעינת מסד הנתונים בעת הפעלת השרת
    console.log(`🚀 השרת פועל בכתובת http://localhost:${PORT}`);
    console.log(`🔑 עמוד התחברות: http://localhost:${PORT}/login.html`);
    console.log(`🏠 עמוד ראשי: http://localhost:${PORT}/index.html`);
});
