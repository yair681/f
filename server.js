const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Octokit } = require('@octokit/rest');

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;

// --- GitHub Database Class ---
class GitHubDB {
    constructor() {
        this.octokit = new Octokit({ 
            auth: process.env.GITHUB_TOKEN 
        });
        this.owner = 'yairfrish'; // ✅ שם המשתמש שלך
        this.repo = 'school-management-system-detailed'; // ✅ שם הריפו שלך
        this.path = 'db.json';
        this.data = {
            users: [],
            classes: [],
            posts: [],
            assignments: []
        };
    }

    async load() {
        try {
            console.log('📥 Loading database from GitHub...');
            const { data } = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: this.path
            });
            
            const content = Buffer.from(data.content, 'base64').toString();
            this.data = JSON.parse(content);
            console.log('✅ Database loaded from GitHub');
            return this.data;
        } catch (error) {
            if (error.status === 404) {
                console.log('📝 No database file found, creating initial data...');
                await this.createInitialData();
            } else {
                console.error('❌ Error loading from GitHub:', error);
            }
            return this.data;
        }
    }

    async createInitialData() {
        const adminPass = bcrypt.hashSync('yair12345', saltRounds);
        const teacherPass = bcrypt.hashSync('teacher123', saltRounds);
        const studentPass = bcrypt.hashSync('student123', saltRounds);
        
        this.data = {
            users: [
                { id: 1, fullname: "יאיר פריש", email: "yairfrish2@gmail.com", password: adminPass, role: "admin", classIds: [] },
                { id: 2, fullname: "מרים כהן", email: "teacher@school.com", password: teacherPass, role: "teacher", classIds: [101] },
                { id: 3, fullname: "דנה לוי", email: "student@school.com", password: studentPass, role: "student", classIds: [101] }
            ],
            classes: [
                { id: 101, name: "כיתה א'1", grade: "א", teacherId: 2, students: [3] }
            ],
            posts: [
                { id: 1, title: 'ברוכים הבאים לאתר', content: 'שנת לימודים מוצלחת ומהנה לכולם!', authorId: 1, authorName: "יאיר פריש", date: new Date(), isPrivate: false, classId: null },
                { id: 2, title: 'שיעורי בית בחשבון', content: 'נא להכין עמוד 10 בספר.', authorId: 2, authorName: "מרים כהן", date: new Date(), isPrivate: true, classId: 101 }
            ],
            assignments: [
                { id: 1, title: 'משימה בחשבון', description: 'לפתור את 10 התרגילים בעמוד 10.', dueDate: '2025-11-10', teacherId: 2, teacherName: "מרים כהן", classId: 101, submissions: [] }
            ]
        };

        await this.save();
    }

    async save() {
        try {
            console.log('💾 Saving database to GitHub...');
            const content = Buffer.from(JSON.stringify(this.data, null, 2)).toString('base64');
            
            let sha;
            try {
                const { data } = await this.octokit.repos.getContent({
                    owner: this.owner,
                    repo: this.repo,
                    path: this.path
                });
                sha = data.sha;
            } catch (error) {
                // File doesn't exist yet
                sha = null;
            }

            await this.octokit.repos.createOrUpdateFileContents({
                owner: this.owner,
                repo: this.repo,
                path: this.path,
                message: `Database update - ${new Date().toISOString()}`,
                content: content,
                sha: sha
            });
            
            console.log('✅ Database saved to GitHub successfully');
        } catch (error) {
            console.error('❌ Error saving to GitHub:', error);
            throw error;
        }
    }

    getNextId(collection) {
        if (this.data[collection].length === 0) return 1;
        return Math.max(...this.data[collection].map(item => item.id)) + 1;
    }
}

// --- Initialize GitHub DB ---
const githubDB = new GitHubDB();
let db = githubDB.data;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
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

app.use(session({
    secret: 'a-very-strong-secret-key-for-school',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// --- Middleware - Authentication ---
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

// --- Load initial data ---
async function initializeApp() {
    try {
        db = await githubDB.load();
        console.log('🚀 App initialized with GitHub database');
    } catch (error) {
        console.error('Failed to initialize app:', error);
    }
}

// Helper function to save after modifications
async function saveDatabase() {
    try {
        await githubDB.save();
    } catch (error) {
        console.error('Error saving database:', error);
        throw error;
    }
}

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

app.put('/api/profile', isAuthenticated, async (req, res) => {
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
    
    try {
        await saveDatabase();
        const userSession = { ...user };
        delete userSession.password;
        req.session.user = userSession;
        res.json(userSession);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

// Users Management
app.get('/api/users', isAuthenticated, isAdmin, (req, res) => {
    const safeUsers = db.users.map(u => {
        const { password, ...safeUser } = u;
        return safeUser;
    });
    res.json(safeUsers);
});

app.post('/api/users', isAuthenticated, isAdmin, async (req, res) => {
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
        id: githubDB.getNextId('users'),
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
    
    try {
        await saveDatabase();
        const { password: pw, ...safeUser } = newUser;
        res.status(201).json(safeUser);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

app.put('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => {
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
    
    try {
        await saveDatabase();
        const { password: pw, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

app.delete('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => {
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
    
    try {
        await saveDatabase();
        res.json({ message: 'המשתמש נמחק בהצלחה.' });
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

// Classes Management
app.get('/api/classes', (req, res) => {
    res.json(db.classes);
});

app.post('/api/classes', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { name, grade, teacherId } = req.body;
    
    const newClass = {
        id: githubDB.getNextId('classes'),
        name,
        grade,
        teacherId: parseInt(teacherId) || null,
        students: []
    };
    
    db.classes.push(newClass);
    
    try {
        await saveDatabase();
        res.status(201).json(newClass);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

app.delete('/api/classes/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => {
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

    try {
        await saveDatabase();
        res.json({ message: 'הכיתה נמחקה בהצלחה.' });
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

app.post('/api/classes/:id/students', isAuthenticated, isAdminOrTeacher, async (req, res) => {
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
    
    try {
        await saveDatabase();
        res.json(aClass);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
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
        !post.isPrivate || userClassIds.includes(post.classId)
    );
    
    res.json(filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/posts', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { title, content, isPrivate, classId } = req.body;
    const author = req.session.user;
    
    const newPost = {
        id: githubDB.getNextId('posts'),
        title,
        content,
        authorId: author.id,
        authorName: author.fullname,
        date: new Date(),
        isPrivate: !!isPrivate,
        classId: isPrivate ? (parseInt(classId) || null) : null
    };
    
    db.posts.push(newPost);
    
    try {
        await saveDatabase();
        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת ההודעה.' });
    }
});

app.delete('/api/posts/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const postId = parseInt(req.params.id);
    const user = req.session.user;
    
    const postIndex = db.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ message: 'הודעה לא נמצאה.' });
    }
    
    if (user.role === 'admin' || db.posts[postIndex].authorId === user.id) {
        db.posts.splice(postIndex, 1);
        
        try {
            await saveDatabase();
            res.json({ message: 'ההודעה נמחקה.' });
        } catch (error) {
            res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
        }
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

app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { title, description, dueDate, classId } = req.body;
    const teacher = req.session.user;
    
    if (!classId) {
        return res.status(400).json({ message: 'חובה לבחור כיתת יעד.' });
    }
    
    const newAssignment = {
        id: githubDB.getNextId('assignments'),
        title,
        description,
        dueDate,
        teacherId: teacher.id,
        teacherName: teacher.fullname,
        classId: parseInt(classId),
        submissions: []
    };
    
    db.assignments.push(newAssignment);
    
    try {
        await saveDatabase();
        res.status(201).json(newAssignment);
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('submissionFile'), async (req, res) => {
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
    
    try {
        await saveDatabase();
        res.json({ message: `המשימה הוגשה בהצלחה: ${req.file.filename}` });
    } catch (error) {
        res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
    }
});

app.delete('/api/assignments/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => {
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
        
        try {
            await saveDatabase();
            res.json({ message: 'המשימה וכל הגשותיה נמחקו בהצלחה.' });
        } catch (error) {
            res.status(500).json({ message: 'שגיאה בשמירת הנתונים.' });
        }
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק משימה זו.' });
    }
});

// --- Start Server ---
app.listen(PORT, async () => {
    await initializeApp();
    console.log(`🚀 השרת פועל בכתובת http://localhost:${PORT}`);
    console.log(`🔑 עמוד התחברות: http://localhost:${PORT}/login.html`);
    console.log(`🏠 עמוד ראשי: http://localhost:${PORT}/index.html`);
});
