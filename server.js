const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// <--- הוספות ושינויים ל-GitHub ו-Cloudinary --->
const multer = require('multer'); 
const { Octokit } = require("@octokit/rest");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
// <--- סוף הוספות --->

const app = express();
const PORT = 3000;
const saltRounds = 10;
// DB_PATH נשאר אבל לא בשימוש לשמירה/טעינה
const DB_PATH = path.join(__dirname, 'db.json');

// --- הגדרת GitHub API ---
const githubToken = process.env.GITHUB_TOKEN;
const dbRepoPath = process.env.DB_REPO_PATH;

if (!githubToken || !dbRepoPath) {
    console.error("שגיאה קריטית: GITHUB_TOKEN או DB_REPO_PATH לא מוגדרים במשתני סביבה.");
    // במצב כזה, נפעיל את השרת אבל השמירה לא תעבוד.
}

const [owner, repo] = dbRepoPath ? dbRepoPath.split('/') : ['', ''];
const DB_FILE_PATH = 'db.json'; 

const octokit = new Octokit({
    auth: githubToken
});
let currentDbSha = ''; // SHA של הקובץ האחרון ב-GitHub

// --- הגדרת Cloudinary (מחליף את תיקיית uploads) ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'School-Submissions', // תיקייה ב-Cloudinary
        resource_type: 'auto', // לטיפול אוטומטי בסוגי קבצים שונים
        public_id: (req, file) => Date.now() + '-' + file.originalname,
    },
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('public')); 

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

// --- בסיס נתונים (JSON File) ---

let db = {
    users: [],
    classes: [],
    posts: [],
    assignments: []
};

// פונקציה לקבלת ה-ID הבא
const getNextId = (collection) => {
    if (collection.length === 0) return 1;
    return Math.max(...collection.map(item => item.id)) + 1;
};

// <--- פונקציות קריאה וכתיבה ל-GitHub --->

async function loadDb() {
    if (!githubToken || !dbRepoPath) {
        console.error("לא ניתן לטעון נתונים מ-GitHub עקב חוסר בפרטי התחברות.");
        return; 
    }
    
    try {
        const res = await octokit.repos.getContent({ owner, repo, path: DB_FILE_PATH });

        const content = Buffer.from(res.data.content, 'base64').toString('utf8');
        db = JSON.parse(content);
        currentDbSha = res.data.sha; 

        console.log("מסד נתונים נטען מ-GitHub בהצלחה.");
        
    } catch (error) {
        if (error.status === 404) {
            console.log("קובץ db.json לא נמצא ב-GitHub. יוצר קובץ חדש.");
            
            // נתוני דוגמה
            const adminPass = bcrypt.hashSync('yair12345', saltRounds);
            const teacherPass = bcrypt.hashSync('teacher123', saltRounds);
            const studentPass = bcrypt.hashSync('student123', saltRounds);
            
            db.users = [
                { id: getNextId(db.users), fullname: "יאיר פריש", email: "yairfrish2@gmail.com", password: adminPass, role: "admin", classIds: [] },
                { id: getNextId(db.users), fullname: "מרים כהן", email: "teacher@school.com", password: teacherPass, role: "teacher", classIds: [101] },
                { id: getNextId(db.users), fullname: "דנה לוי", email: "student@school.com", password: studentPass, role: "student", classIds: [101] }
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
            
            await saveDb("Initial DB creation");
            console.log("מסד נתונים חדש נוצר עם נתוני דוגמה ונשמר ל-GitHub.");
            
        } else {
            console.error("שגיאה קריטית בטעינת מסד הנתונים מ-GitHub:", error.status, error.message);
        }
    }
}

async function saveDb(message = 'DB update by API') {
    if (!githubToken || !dbRepoPath) return; 
    
    try {
        const content = JSON.stringify(db, null, 2);
        const encodedContent = Buffer.from(content).toString('base64');
        
        const commitRes = await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: DB_FILE_PATH,
            message: `${message} at ${new Date().toISOString()}`,
            content: encodedContent,
            sha: currentDbSha 
        });
        
        currentDbSha = commitRes.data.content.sha;
        
    } catch (error) {
        console.error("שגיאה בשמירת מסד הנתונים ל-GitHub:", error.status, error.message);
    }
}

// <--- סוף פונקציות קריאה וכתיבה --->

// --- Middleware - אימות והרשאות (הקוד הקיים שלך) ---
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

// --- API Routes (שימוש ב-await saveDb()) ---

// Authentication
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);

    if (user && bcrypt.compareSync(password, user.password)) {
        req.session.user = { id: user.id, email: user.email, role: user.role, fullname: user.fullname };
        res.json(req.session.user);
    } else {
        res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
    }
});

app.put('/api/profile', isAuthenticated, async (req, res) => {
    const { fullname, password } = req.body;
    const user = db.users.find(u => u.id === req.session.user.id);

    if (fullname) {
        user.fullname = fullname;
        req.session.user.fullname = fullname;
    }
    if (password) {
        user.password = bcrypt.hashSync(password, saltRounds);
    }
    
    await saveDb(`Updated profile for ${user.email}`); 
    res.json({ message: 'הפרופיל עודכן בהצלחה.' });
});

// Users Management (Admin)
app.post('/api/users', isAuthenticated, isAdmin, async (req, res) => {
    const { email, password, role, fullname, studentClassIds = [] } = req.body;
    
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'משתמש עם אימייל זה כבר קיים.' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const newUserId = getNextId(db.users);
    
    const newUser = { id: newUserId, email, password: hashedPassword, role, fullname, classIds: studentClassIds };
    db.users.push(newUser);
    
    // הוספת תלמיד לכיתות
    if (role === 'student') {
        studentClassIds.forEach(classId => {
            const aClass = db.classes.find(c => c.id === classId);
            if (aClass && !aClass.students.includes(newUserId)) {
                aClass.students.push(newUserId);
            }
        });
    }
    
    await saveDb(`New user created: ${email}`); 
    res.status(201).json(newUser);
});

app.put('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { fullname, password, role, studentClassIds = [] } = req.body;
    const user = db.users.find(u => u.id === userId);
    
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא.' });

    if (fullname) user.fullname = fullname;
    if (password) user.password = bcrypt.hashSync(password, saltRounds);
    
    // ניהול כיתות תלמיד
    if (user.role === 'student') {
        // הסרה מכל הכיתות הקיימות
        db.classes.forEach(aClass => {
            aClass.students = aClass.students.filter(id => id !== userId);
        });
        
        // הוספה לכיתות החדשות
        user.classIds = studentClassIds;
        studentClassIds.forEach(classId => {
            const aClass = db.classes.find(c => c.id === classId);
            if (aClass && !aClass.students.includes(userId)) {
                aClass.students.push(userId);
            }
        });
    }
    
    await saveDb(`User ${userId} updated`); 
    res.json({ message: 'המשתמש עודכן בהצלחה.' });
});

app.delete('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const userIndex = db.users.findIndex(u => u.id === userId);

    if (userIndex === -1) return res.status(404).json({ message: 'משתמש לא נמצא.' });

    const deletedUser = db.users[userIndex];
    db.users.splice(userIndex, 1);
    
    // הסרת תלמיד/מורה מכיתות
    if (deletedUser.role === 'student' && deletedUser.classIds) {
        deletedUser.classIds.forEach(classId => {
            const aClass = db.classes.find(c => c.id === classId);
            if (aClass) {
                aClass.students = aClass.students.filter(studentId => studentId !== userId);
            }
        });
    }

    if (deletedUser.role === 'teacher') {
         db.classes.forEach(aClass => {
            if (aClass.teacherId === userId) {
                aClass.teacherId = null; // או מורה ברירת מחדל
            }
        });
    }
    
    await saveDb(`User ${userId} deleted`); 
    res.json({ message: 'המשתמש נמחק בהצלחה.' });
});

// Classes Management
app.post('/api/classes', isAuthenticated, isAdmin, async (req, res) => {
    const { name, grade, teacherId } = req.body;
    const newClassId = getNextId(db.classes);
    const newClass = { id: newClassId, name, grade, teacherId: parseInt(teacherId) || null, students: [] };
    
    db.classes.push(newClass);
    await saveDb(`New class created: ${newClass.name}`); 
    res.status(201).json(newClass);
});

app.delete('/api/classes/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const classId = parseInt(req.params.id);
    const classIndex = db.classes.findIndex(c => c.id === classId);

    if (classIndex === -1) return res.status(404).json({ message: 'כיתה לא נמצאה.' });

    db.classes.splice(classIndex, 1);

    // הסרת השיוך מהתלמידים
    db.users.forEach(user => {
        if (user.role === 'student' && user.classIds) {
            user.classIds = user.classIds.filter(cid => cid !== classId);
        }
    });

    await saveDb(`Class ${classId} deleted`); 
    res.json({ message: 'הכיתה נמחקה בהצלחה.' });
});

// Posts Management
app.post('/api/posts', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { title, content, isPrivate, classId } = req.body;
    const user = req.session.user;
    const newPostId = getNextId(db.posts);
    
    const newPost = { 
        id: newPostId, 
        title, 
        content, 
        authorId: user.id, 
        authorName: user.fullname, 
        date: new Date(), 
        isPrivate: isPrivate === 'true', // מגיע כמחרוזת
        classId: classId ? parseInt(classId) : null 
    };
    
    db.posts.push(newPost);
    await saveDb(`New post created: ${newPost.title}`); 
    res.status(201).json(newPost);
});

app.delete('/api/posts/:id', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const postId = parseInt(req.params.id);
    const user = req.session.user;
    const postIndex = db.posts.findIndex(p => p.id === postId);

    if (postIndex === -1) return res.status(404).json({ message: 'הודעה לא נמצאה.' });
    
    if (user.role === 'admin' || db.posts[postIndex].authorId === user.id) {
        db.posts.splice(postIndex, 1);
        await saveDb(`Post ${postId} deleted`); 
        res.json({ message: 'ההודעה נמחקה.' });
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק הודעה זו.' });
    }
});

// Assignments Management
app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { title, description, dueDate, classId } = req.body;
    const user = req.session.user;
    const newAssignmentId = getNextId(db.assignments);
    
    const newAssignment = { 
        id: newAssignmentId, 
        title, 
        description, 
        dueDate, 
        teacherId: user.id, 
        teacherName: user.fullname, 
        classId: parseInt(classId), 
        submissions: [] 
    };
    
    db.assignments.push(newAssignment);
    await saveDb(`New assignment created: ${newAssignment.title}`); 
    res.status(201).json(newAssignment);
});

// <--- השינוי הקריטי להגשת קבצים (Cloudinary) --->
app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('submissionFile'), async (req, res) => {
    const assignmentId = parseInt(req.params.id);
    const student = req.session.user;
    
    if (student.role !== 'student') {
        // אם הוגש קובץ, נמחק אותו כיוון שהמשתמש לא תלמיד
        if (req.file && req.file.filename) {
             await cloudinary.uploader.destroy(req.file.filename);
        }
        return res.status(403).json({ message: 'רק תלמידים יכולים להגיש משימות.' });
    }
    
    const assignment = db.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
        if (req.file && req.file.filename) {
             await cloudinary.uploader.destroy(req.file.filename);
        }
        return res.status(404).json({ message: 'משימה לא נמצאה.' });
    }
    
    if (!req.file) {
        return res.status(400).json({ message: 'לא נבחר קובץ להגשה.' });
    }
    
    const newSubmission = {
        studentId: student.id,
        studentName: student.fullname,
        file: {
            filename: req.file.filename, // זה ה-public_id ב-Cloudinary
            path: req.file.path, // זה ה-URL המלא של הקובץ
            mimetype: req.file.mimetype,
            size: req.file.size
        }, 
        date: new Date()
    };
    
    const existingSubmissionIndex = assignment.submissions.findIndex(s => s.studentId === student.id);
    if (existingSubmissionIndex > -1) {
        const oldFilePublicId = assignment.submissions[existingSubmissionIndex].file.filename;
        
        // מחיקת הקובץ הישן מ-Cloudinary
        if (oldFilePublicId) {
             await cloudinary.uploader.destroy(oldFilePublicId);
        }
        assignment.submissions[existingSubmissionIndex] = newSubmission;
    } else {
        assignment.submissions.push(newSubmission);
    }
    
    await saveDb(`New submission for assignment ${assignmentId} by ${student.fullname}`); 
    res.json({ message: `המשימה הוגשה בהצלחה: ${req.file.filename}` });
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
            // מחיקת כל הקבצים מ-Cloudinary
            const publicIdsToDelete = assignment.submissions
                .map(sub => sub.file && sub.file.filename)
                .filter(id => id); 
                
            if (publicIdsToDelete.length > 0) {
                 // שימוש ב-delete_resources כדי למחוק מספר קבצים בבת אחת
                 await cloudinary.api.delete_resources(publicIdsToDelete);
            }

        } catch (err) {
            console.error("שגיאה במחיקת קבצי הגשה מ-Cloudinary:", err);
            // נמשיך למחוק את הרשומה מה-DB
        }
        
        db.assignments.splice(assignmentIndex, 1);
        await saveDb(`Assignment ${assignmentId} and all submissions deleted`); 
        res.json({ message: 'המשימה וכל הגשותיה נמחקו בהצלחה.' });
    } else {
        res.status(403).json({ message: 'אין לך הרשאה למחוק משימה זו.' });
    }
});
// <--- סוף השינוי הקריטי להגשת קבצים --->

// --- הפעלת השרת החדשה ---
async function startServer() {
    await loadDb(); // טעינת מסד הנתונים מ-GitHub לפני הפעלת השרת
    
    app.listen(PORT, () => {
        console.log(`🚀 השרת פועל בכתובת http://localhost:${PORT}`);
    });
}

startServer();
