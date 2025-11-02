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
        secure: false, // חייב להיות false ב-http (כמו localhost)
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


// פונקציה שמבטיחה שמשתמשי הדוגמה קיימים ומוצפנים
function ensureDefaultUsers() {
    const defaultUsersData = [
        { fullname: "יאיר פריש", email: "yairfrish2@gmail.com", plaintextPassword: 'yair12345', role: "admin", classIds: [] },
        { fullname: "מרים כהן", email: "teacher@school.com", plaintextPassword: 'teacher123', role: "teacher", classIds: [101] },
        { fullname: "דנה לוי", email: "student@school.com", plaintextPassword: 'student123', role: "student", classIds: [101] }
    ];

    let dbChanged = false;

    defaultUsersData.forEach(defaultUser => {
        const existingUser = db.users.find(u => u.email === defaultUser.email);
        
        if (!existingUser) {
            // 1. אם משתמש הדוגמה חסר, נוסיף אותו
            const hashedPassword = bcrypt.hashSync(defaultUser.plaintextPassword, saltRounds);
            const newUser = {
                id: getNextId(db.users),
                fullname: defaultUser.fullname,
                email: defaultUser.email,
                password: hashedPassword,
                role: defaultUser.role,
                classIds: defaultUser.classIds
            };
            db.users.push(newUser);
            dbChanged = true;
            console.log(`[DB] ✅ נוצר משתמש דוגמה: ${defaultUser.fullname}`);
        } else {
             // 2. אם המשתמש קיים, בודקים האם הסיסמה שלו מוצפנת (bcrypt מתחיל ב-$2a$).
            if (!existingUser.password || !existingUser.password.startsWith('$2a$')) {
                 console.log(`[DB] ⚠️ מזהה סיסמה לא מוצפנת עבור ${defaultUser.fullname}. מצפין מחדש.`);
                 existingUser.password = bcrypt.hashSync(defaultUser.plaintextPassword, saltRounds);
                 dbChanged = true;
            }
            // עדכון שדות נוספים אם המשתמש קיים (למשל תפקיד, כיתות)
            if (existingUser.role !== defaultUser.role) {
                existingUser.role = defaultUser.role;
                dbChanged = true;
            }
             if (!arraysEqual(existingUser.classIds, defaultUser.classIds)) {
                existingUser.classIds = defaultUser.classIds;
                dbChanged = true;
            }
        }
    });

    // ודא שגם כיתת הדוגמה קיימת (אם לא קיימת)
    if (!db.classes.find(c => c.id === 101)) {
        db.classes.push({ id: 101, name: "כיתה א'1", grade: "א", teacherId: db.users.find(u => u.email === 'teacher@school.com')?.id || 2, students: [db.users.find(u => u.email === 'student@school.com')?.id || 3] });
        dbChanged = true;
    }


    if (dbChanged) {
        saveDb();
    }
}

// פונקציית עזר להשוואת מערכים
function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    // יוצר עותקים וממיין כדי להתעלם מהסדר
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();

    for (let i = 0; i < sortedA.length; i++) {
        if (sortedA[i] !== sortedB[i]) return false;
    }
    return true;
}


function loadDb() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf-8');
            // אם הקובץ ריק, JSON.parse ייכשל. ננסה לטפל בזה.
            if (data.trim().length > 0) {
                 db = JSON.parse(data);
                 console.log("מסד הנתונים נטען בהצלחה.");
            } else {
                console.log("קובץ db.json קיים אך ריק. משתמש במסד נתונים ריק.");
            }
        } else {
             console.log("קובץ db.json לא נמצא. יוצר מסד נתונים ריק.");
        }
        
        // ודא שמשתמשי הדוגמה קיימים ועם סיסמה מוצפנת, מבלי לאפס משתמשים קיימים.
        ensureDefaultUsers();
        
    } catch (error) {
        // אם JSON.parse נכשל (SyntaxError), אנחנו נתקעים כאן.
        console.error("שגיאה בטעינת מסד הנתונים:", error);
        // ננסה לתקן את הקובץ הפגום על ידי יצירת db.json חדש עם הנתונים הנוכחיים
        // (הערה: קטע זה מיועד לטיפול ב-SyntaxError שקיבלת)
        if (error.name === 'SyntaxError') {
             console.log("Attempting to recover from corrupted db.json by resetting to default structure...");
             // אם הייתה שגיאת תחביר, נאפס את ה-DB בזיכרון
             db = { users: [], classes: [], posts: [], assignments: [] };
             ensureDefaultUsers(); // נשמור את ה-DB החדש והתקין
             console.log("Recovery successful. DB reset to default users.");
             return; // חזרה מפונקציה
        }
        
        process.exit(1); // עצירת השרת אם אי אפשר לטעון DB
    }
}


// --- API Endpoints ---
// ... (כל נקודות הקצה שלך, לוגין, לוגאאוט, ניהול משתמשים וכו')
// ... (הקוד המלא של נקודות הקצה, כפי שסיפקתי לך בשלב 3)
// ...

// Authentication (עם לוגים לאבחון שגיאת 401)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // --- אבחון: מציג את נתוני הניסיון ---
    console.log(`Attempting login for: ${email}`); 
    
    const user = db.users.find(u => u.email === email);
    
    if (user) {
        // --- אבחון: המשתמש נמצא, בודק סיסמה ---
        console.log(`User found: ${user.fullname}. Comparing password...`); 
        if (bcrypt.compareSync(password, user.password)) {
            const userSession = { ...user };
            delete userSession.password;
            
            req.session.user = userSession;
            // --- אבחון: התחברות הצליחה ---
            console.log(`✅ Login successful for ${user.fullname}.`); 
            res.json(userSession);
        } else {
            // --- אבחון: הסיסמה נכשלה ---
            console.log(`❌ Password comparison failed for ${email}.`); 
            res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
        }
    } else {
        // --- אבחון: המשתמש לא נמצא ---
        console.log(`❌ User not found for email: ${email}`); 
        res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
    }
});

// ... (שאר הקוד של נקודות הקצה כמו בגרסה הקודמת) ...

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
        const freshUser = db.users.find(u => u.id === req.session.user.id);
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
    
    if (db.users[userIndex].email === 'yairfrish2@gmail.com' && email !== 'yairfrish2@gmail.com') {
         return res.status(403).json({ message: 'לא ניתן לשנות את האימייל של משתמש זה.' });
    }

    if (email !== db.users[userIndex].email && db.users.some(u => u.email === email)) {
        return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const user = db.users[userIndex];
    user.fullname = fullname || user.fullname;
    user.email = email || user.email;
    
    if (password) {
        user.password = bcrypt.hashSync(password, saltRounds);
    }
    
    saveDb(); 
    
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

app.put('/api/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    let { fullname, email, role, classIds, password } = req.body;

    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    
    const user = db.users[userIndex];
    
    if (user.email === 'yairfrish2@gmail.com') {
        return res.status(403).json({ message: 'לא ניתן לערוך משתמש זה.' });
    }

    if (email !== user.email && db.users.some(u => u.email === email)) {
         return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
    }
    
    const newClassIds = (role === 'student' && classIds) ? classIds.map(Number) : [];
    
    if (newClassIds.length > 10) {
        return res.status(400).json({ message: 'לא ניתן לשייך תלמיד ליותר מ-10 כיתות.' });
    }
    
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

    if (deletedUser.email === 'yairfrish2@gmail.com') {
        return res.status(403).json({ message: 'לא ניתן למחוק משתמש זה.' });
    }
    
    db.users.splice(userIndex, 1);
    
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

app.post('/api/classes', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const { name, grade, teacherId } = req.body;
    const user = req.session.user;

    let assignedTeacherId;
        
    if (user.role === 'admin') {
        assignedTeacherId = parseInt(teacherId) || null;
    } else if (user.role === 'teacher') {
        assignedTeacherId = user.id;
    } else {
        return res.status(403).json({ message: 'אין לך הרשאה ליצור כיתה.' });
    }
    
    const newClass = {
        id: getNextId(db.classes),
        name,
        grade,
        teacherId: assignedTeacherId, 
        students: []
    };
    
    db.classes.push(newClass);
    saveDb();
    res.status(201).json(newClass);
});

app.delete('/api/classes/:id', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const classId = parseInt(req.params.id);
    
    const classIndex = db.classes.findIndex(c => c.id === classId);
    if (classIndex === -1) {
        return res.status(404).json({ message: 'כיתה לא נמצאה.' });
    }

    const aClass = db.classes[classIndex];
    if (req.session.user.role !== 'admin' && aClass.teacherId !== req.session.user.id) {
        return res.status(403).json({ message: 'רק מנהל או המורה המשויך לכיתה רשאים למחוק אותה.' });
    }

    db.classes.splice(classIndex, 1);

    db.users.forEach(user => {
        if (user.role === 'student' && user.classIds) {
            user.classIds = user.classIds.filter(cid => cid !== classId);
        }
    });

    saveDb();
    res.json({ message: 'הכיתה נמחקה בהצלחה.' });
});


app.post('/api/classes/:id/students', isAuthenticated, isAdminOrTeacher, (req, res) => {
    const classId = parseInt(req.params.id);
    const { studentId } = req.body; 
    
    const aClass = db.classes.find(c => c.id === classId);
    
    if (!aClass) {
        return res.status(404).json({ message: 'כיתה לא נמצאה.' });
    }

    if (req.session.user.role !== 'admin' && aClass.teacherId !== req.session.user.id) {
        return res.status(403).json({ message: 'רק מנהל או המורה המשויך לכיתה רשאים להוסיף תלמידים.' });
    }

    const student = db.users.find(u => u.id === parseInt(studentId) && u.role === 'student');
    
    if (!student) {
        return res.status(404).json({ message: 'תלמיד לא נמצא או שאינו תלמיד.' });
    }
    
    if (!aClass.students.includes(student.id)) {
        aClass.students.push(student.id);
    }
    if (!student.classIds.includes(classId)) {
        student.classIds.push(classId);
    }
    
    saveDb();
    res.json(aClass);
});


// Posts Management
app.get('/api/posts', (req, res) => {
    const user = req.session.user; 
    
    if (!user) {
        return res.json(db.posts.filter(p => !p.isPrivate));
    }
    
    if (user.role === 'admin') {
        return res.json(db.posts); 
    }
    
    const userClassIds = user.classIds || [];
    const filteredPosts = db.posts.filter(post => 
        !post.isPrivate || (post.isPrivate && userClassIds.includes(post.classId))
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
        return res.json(db.assignments); 
    }
    
    if (user.role === 'teacher') {
        const teacherAssignments = db.assignments.filter(a => a.teacherId === user.id);
        return res.json(teacherAssignments);
    }
    
    if (user.role === 'student') {
        const userClassIds = user.classIds || [];
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
        
        if (oldSubmission.file && oldSubmission.file.path) {
            const oldFile = oldSubmission.file.path;
            if (fs.existsSync(oldFile)) {
                fs.unlinkSync(oldFile); 
            }
        }
        
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
