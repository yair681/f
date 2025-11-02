const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer'); // לטיפול בהעלאת קבצים
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
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
        // שומר את הקובץ עם שם ייחודי (חותמת זמן + שם מקורי)
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(express.json()); // לקבלת גוף בקשה בפורמט JSON
app.use(express.urlencoded({ extended: true })); // לפענוח גוף בקשה
app.use(express.static('public')); // הגשת קבצים סטטיים מתיקיית 'public'
// הגשת קבצים שהועלו (לצורך צפייה בהגשות, אם נרצה להוסיף בעתיד)
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

// --- בסיס נתונים (In-Memory) ---

// נתוני הדוגמה שביקשת
const adminPass = bcrypt.hashSync('yair12345', saltRounds);
const teacherPass = bcrypt.hashSync('teacher123', saltRounds);
const studentPass = bcrypt.hashSync('student123', saltRounds);

let users = [
    { id: 1, fullname: "יאיר פריש", email: "yairfrish2@gmail.com", password: adminPass, role: "admin", classId: null },
    { id: 2, fullname: "מרים כהן", email: "teacher@school.com", password: teacherPass, role: "teacher", classId: 101 },
    { id: 3, fullname: "דנה לוי", email: "student@school.com", password: studentPass, role: "student", classId: 101 }
];
let classes = [
    { id: 101, name: "כיתה א'1", grade: "א", teacherId: 2, students: [3] }
];
let posts = [
    { id: 1, title: 'ברוכים הבאים לאתר', content: 'שנת לימודים מוצלחת ומהנה לכולם!', authorId: 1, authorName: "יאיר פריש", date: new Date(), isPrivate: false, classId: null },
    { id: 2, title: 'שיעורי בית בחשבון', content: 'נא להכין עמוד 10 בספר.', authorId: 2, authorName: "מרים כהן", date: new Date(), isPrivate: true, classId: 101 }
];
let assignments = [
    { id: 1, title: 'משימה בחשבון', description: 'לפתור את 10 התרגילים בעמוד 10.', dueDate: '2025-11-10', teacherId: 2, teacherName: "מרים כהן", classId: 101, submissions: [] }
];
let nextUserId = 4;
let nextClassId = 102;
let nextPostId = 3;
let nextAssignmentId = 2;


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
    const user = users.find(u => u.email === email);
    
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
    // מחזיר את המשתמש אם מחובר, או null אם לא
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.json(null);
    }
});

app.put('/api/profile', isAuthenticated, (req, res) => {
    const { fullname, email, password } = req.body;
    const userId = req.session.user.id;
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    const user = users[userIndex];
    user.fullname = fullname || user.fullname;
    user.email = email || user.email;
    
    if (password) {
        user.password = bcrypt.hashSync(password, saltRounds);
    }
    
    const userSession = { ...user };
    delete userSession.password;
    req.session.user = userSession; // עדכון הסשן
    
    res.json(userSession);
});

// Users Management (Admin)
app.get('/api/users', isAuthenticated, isAdmin, (req, res) => {
    const safeUsers = users.map(u => {
        const { password, ...safeUser } = u;
        return safeUser;
    });
    res.json(safeUsers);
});

app.post('/api/users', isAuthenticated, isAdmin, (req, res) => {
    const { fullname, email, password, role, classId } = req.body;
    
    if (!fullname || !email || !password || !role) {
        return res.status(400).json({ message: 'חסרים שדות חובה.' });
    }
    
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const newUser = {
        id: nextUserId++,
        fullname,
        email,
        password: hashedPassword,
        role,
        classId: role === 'student' ? parseInt(classId) : null
    };
    
    users.push(newUser);
    
    if (role === 'student' && classId) {
        const aClass = classes.find(c => c.id === parseInt(classId));
        if (aClass) {
            aClass.students.push(newUser.id);
        }
    }
    
    const { password: pw, ...safeUser } = newUser;
    res.status(201).json(safeUser);
});

app.delete('/api/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    
    if (userId === 1) { // הגנה על משתמש האדמין הראשי
        return res.status(403).json({ message: 'לא ניתן למחוק את משתמש האדמין הראשי.' });
    }
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    const deletedUser = users.splice(userIndex, 1)[0];
    
    // הסרת תלמיד מכיתה
    if (deletedUser.role === 'student' && deletedUser.classId) {
        const aClass = classes.find(c => c.id === deletedUser.classId);
        if (aClass) {
            aClass.students = aClass.students.filter(studentId => studentId !== userId);
        }
    }
    
    res.json({ message: 'המשתמש נמחק בהצלחה.' });
});

// Classes Management
app.get('/api/classes', (req, res) => {
    // נותן לכולם לראות כיתות, אבל רק אדמין יכול לנהל
    // ניתן להוסיף הרשאות אם צריך
    res.json(classes);
});

app.post('/api/classes', isAuthenticated, isAdmin, (req, res) => {
    const { name, grade, teacherId } = req.body;
    
    const newClass = {
        id: nextClassId++,
        name,
        grade,
        teacherId: parseInt(teacherId) || null,
        students: []
    };
    
    classes.push(newClass);
    res.status(201).json(newClass);
});

app.post('/api/classes/:id/students', isAuthenticated, isAdmin, (req, res) => {
    const classId = parseInt(req.params.id);
    const { studentId } = req.body;
    
    const aClass = classes.find(c => c.id === classId);
    const student = users.find(u => u.id === studentId && u.role === 'student');
    
    if (!aClass || !student) {
        return res.status(404).json({ message: 'כיתה או תלמיד לא נמצאו.' });
    }
    
    // הסרת תלמיד מכיתה ישנה אם קיים
    if (student.classId) {
        const oldClass = classes.find(c => c.id === student.classId);
        if (oldClass) {
            oldClass.students = oldClass.students.filter(id => id !== studentId);
        }
    }
    
    // הוספה לכיתה חדשה
    if (!aClass.students.includes(studentId)) {
        aClass.students.push(studentId);
    }
    student.classId = classId;
    
    res.json(aClass);
});

// Posts Management
app.get('/api/posts', (req, res) => {
    const user = req.session.user; // יכול להיות null
    
    if (!user) {
        // משתמש לא מחובר רואה רק הודעות ציבוריות
        return res.json(posts.filter(p => !p.isPrivate));
    }
    
    if (user.role === 'admin') {
        return res.json(posts); // מנהל רואה הכל
    }
    
    // מורה ותלמיד רואים הודעות ציבוריות + הודעות כיתתיות
    const userClassId = user.classId;
    const filteredPosts = posts.filter(post => 
        !post.isPrivate || (post.classId === userClassId)
    );
    
    res.json(filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/posts', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { title, content, isPrivate, classId } = req.body;
    const author = req.session.user;
    
    const newPost = {
        id: nextPostId++,
        title,
        content,
        authorId: author.id,
        authorName: author.fullname,
        date: new Date(),
        isPrivate: !!isPrivate,
        classId: isPrivate ? (parseInt(classId) || author.classId) : null
    };
    
    posts.push(newPost);
    res.status(201).json(newPost);
});

app.delete('/api/posts/:id', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const postId = parseInt(req.params.id);
    const user = req.session.user;
    
    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ message: 'הודעה לא נמצאה.' });
    }
    
    // מנהל יכול למחוק הכל, מורה יכול למחוק רק את שלו
    if (user.role === 'admin' || posts[postIndex].authorId === user.id) {
        posts.splice(postIndex, 1);
        res.json({ message: 'ההודעה נמחקה.' });
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק הודעה זו.' });
    }
});

// Assignments Management
app.get('/api/assignments', (req, res) => {
    const user = req.session.user; // יכול להיות null
    
    if (!user) {
        return res.json([]); // לא מחובר לא רואה משימות
    }
    
    if (user.role === 'admin') {
        return res.json(assignments); // מנהל רואה הכל
    }
    
    if (user.role === 'teacher') {
        // מורה רואה משימות שהוא יצר
        const teacherAssignments = assignments.filter(a => a.teacherId === user.id);
        return res.json(teacherAssignments);
    }
    
    if (user.role === 'student') {
        // תלמיד רואה משימות של הכיתה שלו
        const studentAssignments = assignments.filter(a => a.classId === user.classId);
        return res.json(studentAssignments);
    }
});

app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { title, description, dueDate, classId } = req.body;
    const teacher = req.session.user;
    
    const newAssignment = {
        id: nextAssignmentId++,
        title,
        description,
        dueDate,
        teacherId: teacher.id,
        teacherName: teacher.fullname,
        classId: parseInt(classId) || teacher.classId,
        submissions: []
    };
    
    assignments.push(newAssignment);
    res.status(201).json(newAssignment);
});

// שימוש ב-multer להעלאת קובץ יחיד בשם 'submissionFile'
app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('submissionFile'), (req, res) => {
    const assignmentId = parseInt(req.params.id);
    const student = req.session.user;
    
    if (student.role !== 'student') {
        return res.status(403).json({ message: 'רק תלמידים יכולים להגיש משימות.' });
    }
    
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) {
        return res.status(404).json({ message: 'משימה לא נמצאה.' });
    }
    
    if (!req.file) {
        return res.status(400).json({ message: 'לא נבחר קובץ להגשה.' });
    }
    
    const newSubmission = {
        studentId: student.id,
        studentName: student.fullname,
        file: req.file, // מכיל את כל פרטי הקובץ שהועלה
        date: new Date()
    };
    
    // בדיקה אם התלמיד כבר הגיש (ומחיקת קובץ ישן אם כן)
    const existingSubmissionIndex = assignment.submissions.findIndex(s => s.studentId === student.id);
    if (existingSubmissionIndex > -1) {
        // מחיקת הקובץ הישן (אופציונלי)
        const oldFile = assignment.submissions[existingSubmissionIndex].file.path;
        if (fs.existsSync(oldFile)) {
            fs.unlinkSync(oldFile);
        }
        // החלפת ההגשה
        assignment.submissions[existingSubmissionIndex] = newSubmission;
    } else {
        assignment.submissions.push(newSubmission);
    }
    
    res.json({ message: `המשימה הוגשה בהצלחה: ${req.file.filename}` });
});


// --- הפעלת השרת ---
app.listen(PORT, () => {
    console.log(`🚀 השרת פועל בכתובת http://localhost:${PORT}`);
    console.log(`🔗 עמוד התחברות: http://localhost:${PORT}/login.html`);
    console.log(`🔗 עמוד ראשי: http://localhost:${PORT}/index.html`);
});