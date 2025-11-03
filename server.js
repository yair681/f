const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose'); // נדרש ל-MongoDB

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;
const uploadDir = 'uploads/';

// 🚨 חשוב: מחרוזת החיבור ל-MongoDB (צריך להיות מוגדר כמשתנה סביבה!)
const MONGODB_URI = process.env.MONGODB_URI; 

if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI environment variable is not set.");
    console.error("--- עצור! עליך להגדיר את המשתנה הסביבתי הזה. ---");
    process.exit(1);
}


// --- הגדרת Multer להעלאת קבצים ---
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadDir); },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
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

// --- הגדרת סכמות Mongoose (המבנה של הנתונים) ---

const UserSchema = new mongoose.Schema({
    fullname: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
    classIds: { type: [Number], default: [] }, // מערך של מזהי כיתות
});

const ClassSchema = new mongoose.Schema({
    id: { type: Number, unique: true, required: true }, // מזהה קשיח
    name: { type: String, required: true },
    grade: String,
    teacherId: mongoose.Schema.Types.ObjectId, // מזהה של מורה (ObjectId)
    students: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // מערך מזהי תלמידים (ObjectId)
});

const PostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, required: true }, // מזהה מחבר (ObjectId)
    authorName: String,
    date: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false },
    classId: Number,
});

const AssignmentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    dueDate: Date,
    teacherId: { type: mongoose.Schema.Types.ObjectId, required: true },
    teacherName: String,
    classId: { type: Number, required: true },
    submissions: { type: [{
        studentId: mongoose.Schema.Types.ObjectId, // מזהה תלמיד שהגיש
        studentName: String,
        file: Object, // לשמור את מטא-נתונים של הקובץ מ-Multer
        date: Date
    }], default: [] },
});

// המודלים
const User = mongoose.model('User', UserSchema);
const Class = mongoose.model('Class', ClassSchema, 'classes');
const Post = mongoose.model('Post', PostSchema);
const Assignment = mongoose.model('Assignment', AssignmentSchema);

// פונקציה לעדכון אוטומטי של ה-ID הבא (לצורך ClassId במקום ObjectId)
async function getNextClassId() {
    const lastClass = await Class.findOne().sort({ id: -1 });
    // אם אין כיתות, נתחיל מ-101. אחרת, נמשיך הלאה.
    return lastClass ? lastClass.id + 1 : 101; 
}


// פונקציה המבטיחה שמשתמשי הדוגמה קיימים ומוצפנים
async function ensureDefaultUsers() {
    const defaultUsersData = [
        { fullname: "יאיר פריש", email: "yairfrish2@gmail.com", plaintextPassword: 'yair12345', role: "admin", classIds: [101] },
        { fullname: "מרים כהן", email: "teacher@school.com", plaintextPassword: 'teacher123', role: "teacher", classIds: [101] },
        { fullname: "דנה לוי", email: "student@school.com", plaintextPassword: 'student123', role: "student", classIds: [101] }
    ];

    // מציאת או יצירת משתמשי הדוגמה
    const usersMap = {};
    for (const defaultUser of defaultUsersData) {
        let user = await User.findOne({ email: defaultUser.email });
        
        if (!user) {
            const hashedPassword = bcrypt.hashSync(defaultUser.plaintextPassword, saltRounds);
            user = await User.create({
                fullname: defaultUser.fullname,
                email: defaultUser.email,
                password: hashedPassword,
                role: defaultUser.role,
                classIds: defaultUser.classIds.map(Number)
            });
            console.log(`[DB] ✅ נוצר משתמש דוגמה: ${defaultUser.fullname}`);
        } else {
             // לוודא שהסיסמה מוצפנת (בדיקה גסה)
            if (!user.password || !user.password.startsWith('$2a$')) {
                 user.password = bcrypt.hashSync(defaultUser.plaintextPassword, saltRounds);
                 await user.save();
            }
        }
        usersMap[defaultUser.role] = user;
    }

    // מציאת או יצירת כיתת הדוגמה (ID 101)
    const teacherUser = usersMap['teacher'];
    const studentUser = usersMap['student'];

    let class101 = await Class.findOne({ id: 101 });
    if (!class101) {
        class101 = await Class.create({ 
            id: 101, 
            name: "כיתה א'1", 
            grade: "א", 
            teacherId: teacherUser._id, 
            students: [studentUser._id] 
        });
        console.log(`[DB] ✅ נוצרה כיתת דוגמה: א'1`);
    } else {
        // לוודא שהכיתה מקושרת נכון למורה ולתלמיד הדוגמה
        let needsUpdate = false;
        if (!class101.teacherId || class101.teacherId.toString() !== teacherUser._id.toString()) {
            class101.teacherId = teacherUser._id;
            needsUpdate = true;
        }
        if (!class101.students.map(id => id.toString()).includes(studentUser._id.toString())) {
            class101.students.push(studentUser._id);
            needsUpdate = true;
        }
        if(needsUpdate) {
            await class101.save();
        }
    }
}


// --- Middleware - אימות והרשאות ---
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        // המשתמש מחובר - ממשיך
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

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // מציאת המשתמש לפי אימייל
        const user = await User.findOne({ email });

        if (user) {
            // השוואת סיסמה
            if (bcrypt.compareSync(password, user.password)) {
                // יוצרים אובייקט סשן ללא סיסמה
                const userSession = user.toObject(); 
                delete userSession.password;
                
                req.session.user = userSession;
                res.json(userSession);
            } else {
                res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
            }
        } else {
            res.status(401).json({ message: 'אימייל או סיסמה שגויים.' });
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'ההתנתקות נכשלה.' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'התנתקת בהצלחה.' });
    });
});

// Get Me
app.get('/api/me', async (req, res) => {
    if (req.session.user) {
        try {
            // מביא את הנתונים העדכניים של המשתמש מה-DB
            const freshUser = await User.findById(req.session.user._id);

            if (freshUser) {
                const userSession = freshUser.toObject();
                delete userSession.password;
                req.session.user = userSession;
                res.json(userSession);
            } else {
                // אם המשתמש נמחק מה-DB
                req.session.destroy(() => {
                    res.json(null);
                });
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            res.json(null);
        }
    } else {
        res.json(null);
    }
});

// Update Profile
app.put('/api/profile', isAuthenticated, async (req, res) => {
    const { fullname, email, password } = req.body;
    const userId = req.session.user._id; 
    
    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'משתמש לא נמצא.' });
        }
        
        // מניעת שינוי אימייל מנהל ראשי
        if (user.email === 'yairfrish2@gmail.com' && email && email !== 'yairfrish2@gmail.com') {
             return res.status(403).json({ message: 'לא ניתן לשנות את האימייל של משתמש זה.' });
        }

        // בדיקה אם האימייל החדש כבר קיים
        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ email, _id: { $ne: userId } });
            if (existingEmail) {
                return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
            }
        }
        
        user.fullname = fullname || user.fullname;
        user.email = email || user.email;
        
        if (password) {
            user.password = bcrypt.hashSync(password, saltRounds);
        }

        await user.save();
        
        // עדכון הסשן
        const userSession = user.toObject();
        delete userSession.password;
        req.session.user = userSession;
        
        res.json(userSession);
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Users Management (Admin) - Get
app.get('/api/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // מחזיר את כל המשתמשים ללא שדה סיסמה
        const users = await User.find({}, { password: 0 }); 
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Users Management (Admin) - Create
app.post('/api/users', isAuthenticated, isAdmin, async (req, res) => {
    let { fullname, email, password, role, classIds } = req.body;
    
    if (!fullname || !email || !password || !role) {
        return res.status(400).json({ message: 'חסרים שדות חובה.' });
    }
    
    const studentClassIds = (role === 'student' && classIds) ? classIds.map(Number) : [];

    try {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: 'אימייל זה כבר קיים במערכת.' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, saltRounds);
        
        const newUser = new User({
            fullname,
            email,
            password: hashedPassword,
            role,
            classIds: studentClassIds
        });
        
        await newUser.save();
        
        // הוספת התלמיד לכיתות המתאימות בטבלת Classes
        if (role === 'student' && studentClassIds.length > 0) {
             await Class.updateMany(
                { id: { $in: studentClassIds }, students: { $ne: newUser._id } },
                { $push: { students: newUser._id } }
            );
        }
        
        const safeUser = newUser.toObject();
        delete safeUser.password;
        res.status(201).json(safeUser);
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Classes Management - Get
app.get('/api/classes', async (req, res) => {
    try {
        const classes = await Class.find({});
        res.json(classes);
    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Classes Management - Create
app.post('/api/classes', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { name, grade, teacherId } = req.body;
    const user = req.session.user;

    // מזהה המורה מושג מהסשן או מה-body אם מנהל
    let assignedTeacherId;
        
    if (user.role === 'admin') {
        assignedTeacherId = teacherId ? new mongoose.Types.ObjectId(teacherId) : null;
    } else if (user.role === 'teacher') {
        assignedTeacherId = new mongoose.Types.ObjectId(user._id); 
    } else {
        return res.status(403).json({ message: 'אין לך הרשאה ליצור כיתה.' });
    }
    
    try {
        const newClassId = await getNextClassId();
        
        const newClass = new Class({
            id: newClassId,
            name,
            grade,
            teacherId: assignedTeacherId, 
            students: []
        });
        
        await newClass.save();
        res.status(201).json(newClass);
    } catch (error) {
        console.error("Error creating class:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Posts - Get (Feed)
app.get('/api/posts', isAuthenticated, async (req, res) => {
    const user = req.session.user;
    
    try {
        let query = {};
        
        // תלמיד רואה רק פוסטים שאינם פרטיים וששייכים לכיתותיו
        if (user.role === 'student') {
            query = { 
                $or: [
                    { isPrivate: false }, // פוסטים ציבוריים
                    { classId: { $in: user.classIds } } // פוסטים פרטיים לכיתותיו
                ]
            };
        } 
        
        // מורה רואה את כל הפוסטים (ציבוריים, פרטיים ושל כיתותיו)
        // מנהל רואה את כל הפוסטים

        const posts = await Post.find(query).sort({ date: -1 });
        res.json(posts);
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Posts - Create
app.post('/api/posts', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { title, content, isPrivate, classId } = req.body;
    const user = req.session.user;

    // מורה יכול לפרסם רק לכיתות שהוא מלמד או פרטי
    if (user.role === 'teacher' && classId && !user.classIds.includes(parseInt(classId))) {
         return res.status(403).json({ message: 'אינך רשאי לפרסם בכיתה זו.' });
    }
    
    try {
        const newPost = new Post({
            title,
            content,
            authorId: user._id,
            authorName: user.fullname,
            isPrivate: isPrivate === 'true' || isPrivate === true,
            classId: classId ? parseInt(classId) : null
        });
        
        await newPost.save();
        res.status(201).json(newPost);
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Assignments - Get
app.get('/api/assignments', isAuthenticated, async (req, res) => {
    const user = req.session.user;
    
    try {
        let query = {};
        
        if (user.role === 'student') {
            // תלמיד רואה משימות רק לכיתותיו
            query = { classId: { $in: user.classIds } };
        } else if (user.role === 'teacher') {
            // מורה רואה משימות שהוא יצר או משימות לכיתותיו
             query = { 
                $or: [
                    { teacherId: user._id }, 
                    { classId: { $in: user.classIds } }
                ]
            };
        } 
        
        const assignments = await Assignment.find(query).sort({ dueDate: 1 });
        res.json(assignments);
    } catch (error) {
        console.error("Error fetching assignments:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Assignments - Create
app.post('/api/assignments', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { title, description, dueDate, classId } = req.body;
    const user = req.session.user;

    if (!title || !description || !dueDate || !classId) {
        return res.status(400).json({ message: 'חסרים שדות חובה.' });
    }

    const classIdInt = parseInt(classId);

    // מורה יכול ליצור משימה רק לכיתות שהוא מלמד
    if (user.role === 'teacher' && !user.classIds.includes(classIdInt)) {
         return res.status(403).json({ message: 'אינך רשאי ליצור משימה לכיתה זו.' });
    }
    
    try {
        const newAssignment = new Assignment({
            title,
            description,
            dueDate: new Date(dueDate),
            teacherId: user._id,
            teacherName: user.fullname,
            classId: classIdInt
        });
        
        await newAssignment.save();
        res.status(201).json(newAssignment);
    } catch (error) {
        console.error("Error creating assignment:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Assignments - Submit (Student)
app.post('/api/assignments/:id/submit', isAuthenticated, upload.single('file'), async (req, res) => {
    const user = req.session.user;
    const assignmentId = req.params.id;

    if (user.role !== 'student') {
        return res.status(403).json({ message: 'רק תלמידים יכולים להגיש משימות.' });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'חובה לצרף קובץ.' });
    }

    try {
        const assignment = await Assignment.findById(assignmentId);

        if (!assignment) {
            return res.status(404).json({ message: 'המשימה לא נמצאה.' });
        }
        
        // לוודא שהתלמיד שייך לכיתה הזו
        if (!user.classIds.includes(assignment.classId)) {
            return res.status(403).json({ message: 'אין לך הרשאה להגיש משימה זו.' });
        }
        
        const submission = {
            studentId: user._id,
            studentName: user.fullname,
            file: {
                filename: req.file.filename,
                mimetype: req.file.mimetype,
                size: req.file.size
            },
            date: new Date()
        };

        // בדיקה אם התלמיד כבר הגיש, ואם כן - עדכון ההגשה
        const existingIndex = assignment.submissions.findIndex(s => s.studentId.toString() === user._id.toString());
        
        if (existingIndex > -1) {
            // אם כבר הגיש - מוחקים את הקובץ הקודם ושומרים את החדש
            if (fs.existsSync(path.join(uploadDir, assignment.submissions[existingIndex].file.filename))) {
                 fs.unlinkSync(path.join(uploadDir, assignment.submissions[existingIndex].file.filename));
            }
            assignment.submissions[existingIndex] = submission;
        } else {
            assignment.submissions.push(submission);
        }

        await assignment.save();
        res.json({ message: 'המשימה הוגשה בהצלחה.', submission });
    } catch (error) {
        console.error("Error submitting assignment:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});

// Assignments - Download Submission (Teacher/Admin)
app.get('/api/assignments/download/:assignmentId/:studentId', isAuthenticated, isAdminOrTeacher, async (req, res) => {
    const { assignmentId, studentId } = req.params;
    
    try {
        const assignment = await Assignment.findById(assignmentId);

        if (!assignment) {
            return res.status(404).json({ message: 'המשימה לא נמצאה.' });
        }
        
        const submission = assignment.submissions.find(s => s.studentId.toString() === studentId.toString());

        if (!submission || !submission.file || !submission.file.filename) {
            return res.status(404).json({ message: 'הגשה או קובץ לא נמצאו.' });
        }
        
        const filePath = path.join(uploadDir, submission.file.filename);
        
        if (fs.existsSync(filePath)) {
            // שליחת הקובץ
            res.download(filePath, `${submission.studentName}-${assignment.title}-${path.extname(submission.file.filename)}`);
        } else {
            res.status(404).json({ message: 'קובץ ההגשה לא נמצא בשרת.' });
        }
    } catch (error) {
        console.error("Error downloading submission:", error);
        res.status(500).json({ message: 'שגיאת שרת פנימית.' });
    }
});


// --- הפעלת השרת ---
async function startServer() {
    try {
        // 1. התחברות ל-DB
        await mongoose.connect(MONGODB_URI);
        console.log("✅ השרת מחובר ל-MongoDB בהצלחה.");
        
        // 2. הבטחת משתמשי דוגמה
        await ensureDefaultUsers();

        // 3. הפעלת ה-Listener
        app.listen(PORT, () => {
            console.log(`🚀 השרת פועל בכתובת http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("❌ שגיאה בהפעלת השרת או בחיבור ל-DB:", error);
        process.exit(1);
    }
}

startServer();
