const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const saltRounds = 10;

// --- הגדרת נתיב לקובץ הנתונים ---
const DATA_DIR = 'data/';
const DATA_FILE = path.join(DATA_DIR, 'db.json');

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
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// --- בסיס נתונים (File-Based Persistence) ---

let db = {}; // האובייקט המרכזי שיכיל את כל הנתונים

// פונקציות שמירה וטעינה
const saveData = () => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error("שגיאה בשמירת הנתונים לקובץ:", err);
    }
};

const loadData = () => {
    // ודא שספריית הנתונים קיימת
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }

    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            db = JSON.parse(data);
        } catch (err) {
            console.error("שגיאה בטעינת הנתונים מקובץ, משתמש בנתוני ברירת מחדל:", err);
            initializeDefaultData();
        }
    } else {
        // אם הקובץ לא קיים, אתחל נתוני ברירת מחדל ושמור
        initializeDefaultData();
        saveData(); 
    }
};

// אתחול נתוני ברירת מחדל
const initializeDefaultData = () => {
    const adminPass = bcrypt.hashSync('yair12345', saltRounds);
    const teacherPass = bcrypt.hashSync('teacher123', saltRounds);
    const studentPass = bcrypt.hashSync('student123', saltRounds);

    db.users = [
        { id: 1, fullname: "יאיר פריש", email: "yairfrish2@gmail.com", password: adminPass, role: "admin", classId: null },
        { id: 2, fullname: "מרים כהן", email: "teacher@school.com", password: teacherPass, role: "teacher", classId: 101 },
        { id: 3, fullname: "דנה לוי", email: "student@school.com", password: studentPass, role: "student", classId: 101 }
    ];
    db.classes = [
        { id: 101, name: "כיתה א'1", grade: "א", teacherId: 2, students: [3] }
    ];
    db.posts = [
        { id: 1, title: 'ברוכים הבאים לאתר', content: 'שנת לימודים מוצלחת ומהנה לכולם!', authorId: 1, authorName: "יאיר פריש", date: new Date(), isPrivate: false, classIds: null },
        // הודעה כיתתית חדשה - שימוש ב-classIds (מערך)
        { id: 2, title: 'שיעורי בית בחשבון', content: 'נא להכין עמוד 10 בספר.', authorId: 2, authorName: "מרים כהן", date: new Date(), isPrivate: true, classIds: [101] }
    ];
    db.assignments = [
        { id: 1, title: 'משימה בחשבון', description: 'לפתור את 10 התרגילים בעמוד 10.', dueDate: '2025-11-10', teacherId: 2, teacherName: "מרים כהן", classId: 101, submissions: [] }
    ];
    db.nextUserId = 4;
    db.nextClassId = 102;
    db.nextPostId = 3;
    db.nextAssignmentId = 2;
};

// טוען את הנתונים בזמן הפעלת השרת
loadData(); 

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
        res.json(req.session.user);
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
    
    const user = db.users[userIndex];
    user.fullname = fullname || user.fullname;
    user.email = email || user.email;
    
    if (password) {
        user.password = bcrypt.hashSync(password, saltRounds);
    }
    
    // שמירת הנתונים לאחר השינוי
    saveData(); 
    
    const userSession = { ...user };
    delete userSession.password;
    req.session.user = userSession; 
    
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
    const { fullname, email, password, role, classId } = req.body;
    
    if (!fullname || !email || !password || !role) {
        return res.status(400).json({ message: 'חסרים שדות חובה.' });
    }
    
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const newUser = {
        id: db.nextUserId++,
        fullname,
        email,
        password: hashedPassword,
        role,
        classId: role === 'student' ? parseInt(classId) : null
    };
    
    db.users.push(newUser);
    
    if (role === 'student' && classId) {
        const aClass = db.classes.find(c => c.id === parseInt(classId));
        if (aClass) {
            aClass.students.push(newUser.id);
        }
    }
    
    // שמירת הנתונים לאחר השינוי
    saveData(); 
    
    const { password: pw, ...safeUser } = newUser;
    res.status(201).json(safeUser);
});

app.delete('/api/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    
    if (userId === 1) { 
        return res.status(403).json({ message: 'לא ניתן למחוק את משתמש האדמין הראשי.' });
    }
    
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    const deletedUser = db.users.splice(userIndex, 1)[0];
    
    // הסרת תלמיד מכיתה
    if (deletedUser.role === 'student' && deletedUser.classId) {
        const aClass = db.classes.find(c => c.id === deletedUser.classId);
        if (aClass) {
            aClass.students = aClass.students.filter(studentId => studentId !== userId);
        }
    }
    
    // שמירת הנתונים לאחר השינוי
    saveData(); 

    res.json({ message: 'המשתמש נמחק בהצלחה.' });
});

// Classes Management
app.get('/api/classes', (req, res) => {
    res.json(db.classes);
});

app.post('/api/classes', isAuthenticated, isAdmin, (req, res) => {
    const { name, grade, teacherId } = req.body;
    
    const newClass = {
        id: db.nextClassId++,
        name,
        grade,
        teacherId: parseInt(teacherId) || null,
        students: []
    };
    
    db.classes.push(newClass);
    // שמירת הנתונים לאחר השינוי
    saveData(); 

    res.status(201).json(newClass);
});

app.post('/api/classes/:id/students', isAuthenticated, isAdmin, (req, res) => {
    const classId = parseInt(req.params.id);
    const { studentId } = req.body;
    
    const aClass = db.classes.find(c => c.id === classId);
    const student = db.users.find(u => u.id === studentId && u.role === 'student');
    
    if (!aClass || !student) {
        return res.status(404).json({ message: 'כיתה או תלמיד לא נמצאו.' });
    }
    
    // הסרת תלמיד מכיתה ישנה אם קיים
    if (student.classId) {
        const oldClass = db.classes.find(c => c.id === student.classId);
        if (oldClass) {
            oldClass.students = oldClass.students.filter(id => id !== studentId);
        }
    }
    
    // הוספה לכיתה חדשה
    if (!aClass.students.includes(studentId)) {
        aClass.students.push(studentId);
    }
    student.classId = classId;
    
    // שמירת הנתונים לאחר השינוי
    saveData(); 

    res.json(aClass);
});

// Posts Management
app.get('/api/posts', (req, res) => {
    const user = req.session.user; 
    
    if (!user) {
        // משתמש לא מחובר רואה רק הודעות ציבוריות
        return res.json(db.posts.filter(p => !p.isPrivate));
    }
    
    if (user.role === 'admin') {
        return res.json(db.posts.sort((a, b) => new Date(b.date) - new Date(a.date))); 
    }
    
    // מורה ותלמיד רואים הודעות ציבוריות + הודעות כיתתיות שאליהן הם משויכים
    const userClassId = user.classId;
    const filteredPosts = db.posts.filter(post => 
        !post.isPrivate || (post.classIds && post.classIds.includes(userClassId))
    );
    
    res.json(filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/posts', isAuthenticated, isAdminOrTeacher, (req, res) => {
    // קיבלנו classIds כפי שהוגדר ב-app.js
    const { title, content, isPrivate, classIds } = req.body; 
    const author = req.session.user;
    
    // ודא ש-classIds הוא מערך של מספרים שלמים אם isPrivate נכון
    const classIdArray = isPrivate && Array.isArray(classIds) 
        ? classIds.map(id => parseInt(id)) 
        : null;

    if (isPrivate && (!classIdArray || classIdArray.length === 0)) {
        // מונע פרסום הודעה כיתתית ללא בחירת כיתה
        return res.status(400).json({ message: 'יש לבחור כיתה אחת לפחות עבור הודעה כיתתית.' });
    }

    const newPost = {
        id: db.nextPostId++,
        title,
        content,
        authorId: author.id,
        authorName: author.fullname,
        date: new Date(),
        isPrivate: !!isPrivate,
        classIds: classIdArray // שמירה כמערך
    };
    
    db.posts.push(newPost);
    // שמירת הנתונים לאחר השינוי
    saveData(); 

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
        // שמירת הנתונים לאחר השינוי
        saveData(); 

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
        return res.json(db.assignments);
    }
    
    if (user.role === 'teacher') {
        const teacherAssignments = db.assignments.filter(a => a.teacherId === user.id);
        return res.json(teacherAssignments);
    }
    
    if (user.role === 'student') {
        const studentAssignments = db.assignments.filter(a => a.classId === user.classId);
        return res.json(studentAssignments);
    }
});

app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { title, description, dueDate, classId } = req.body;
    const teacher = req.session.user;
    
    const newAssignment = {
        id: db.nextAssignmentId++,
        title,
        description,
        dueDate,
        teacherId: teacher.id,
        teacherName: teacher.fullname,
        classId: parseInt(classId) || teacher.classId,
        submissions: []
    };
    
    db.assignments.push(newAssignment);
    // שמירת הנתונים לאחר השינוי
    saveData(); 

    res.status(201).json(newAssignment);
});

app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('submissionFile'), (req, res) => {
    const assignmentId = parseInt(req.params.id);
    const student = req.session.user;
    
    if (student.role !== 'student') {
        return res.status(403).json({ message: 'רק תלמידים יכולים להגיש משימות.' });
    }
    
    const assignment = db.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
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
        const oldFile = assignment.submissions[existingSubmissionIndex].file.path;
        if (fs.existsSync(oldFile)) {
            fs.unlinkSync(oldFile);
        }
        assignment.submissions[existingSubmissionIndex] = newSubmission;
    } else {
        assignment.submissions.push(newSubmission);
    }
    
    // שמירת הנתונים לאחר השינוי
    saveData(); 

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
                if (sub.file && fs.existsSync(sub.file.path)) {
                    fs.unlinkSync(sub.file.path);
                }
            });
        } catch (err) {
            console.error("שגיאה במחיקת קבצי הגשה:", err);
        }
        
        db.assignments.splice(assignmentIndex, 1);
        // שמירת הנתונים לאחר השינוי
        saveData(); 

        res.json({ message: 'המשימה וכל הגשותיה נמחקו בהצלחה.' });
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק משימה זו.' });
    }
});


// --- הפעלת השרת ---
app.listen(PORT, () => {
    console.log(`✅ השרת פועל בכתובת http://localhost:${PORT}`);
    console.log(`📁 הנתונים נשמרים בקובץ ${DATA_FILE}`);
});
