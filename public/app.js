document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        currentUser: null,
        users: [],
        classes: [],
        posts: [],
        assignments: []
    };

    // --- DOM Elements ---
    const contentEl = document.getElementById('app-content');
    const navEl = document.getElementById('app-nav');
    const headerTitleEl = document.getElementById('header-title');
    const authControlsEl = document.getElementById('auth-controls');
    const notificationArea = document.getElementById('notification-area');

    // --- API Helper ---
    // (שימוש ב-fetch API מובנה)

    // --- Initialization ---
    async function initializeApp() {
        try {
            const res = await fetch('/api/me');
            if (!res.ok) { // אם הסשן פג או לא תקין
                 state.currentUser = null;
            } else {
                state.currentUser = await res.json(); // יהיה null אם לא מחובר
            }
            renderLayout();
            loadView('dashboard'); // טעינת עמוד הבית כברירת מחדל
        } catch (error) {
            console.error('Error initializing app:', error);
            state.currentUser = null;
            renderLayout();
            loadView('publicPosts'); // אם יש שגיאה, טען עמוד ציבורי
        }
        
        // הוספת Event Listeners גלובליים
        navEl.addEventListener('click', handleNavClick);
        authControlsEl.addEventListener('click', handleAuthClick);
        contentEl.addEventListener('click', handleContentClick);
        contentEl.addEventListener('submit', handleFormSubmit);
    }

    // --- Layout Rendering ---
    function renderLayout() {
        renderHeader();
        renderNav();
    }

    function renderHeader() {
        if (state.currentUser) {
            const { fullname, role } = state.currentUser;
            headerTitleEl.innerHTML = `שלום, ${fullname} (${translateRole(role)})`;
            authControlsEl.innerHTML = `
                <button class="nav-btn" data-view="profile">👤 פרופיל</button>
                <button class="btn-danger" id="logout-btn">🚪 התנתקות</button>
            `;
        } else {
            // (חדש) שינוי שם
            headerTitleEl.innerHTML = `בית ספר "פרחי אהרון"`;
            authControlsEl.innerHTML = `
                <a href="login.html" class="btn-primary">🔒 התחברות</a>
            `;
        }
    }

    function renderNav() {
        const { currentUser } = state;
        let navLinks = '';

        if (!currentUser) {
            navLinks = `<button class="nav-btn active" data-view="publicPosts">📢 הודעות כלליות</button>`;
        } else {
            // קישורים בסיסיים לכל המחוברים
            navLinks = `
                <button class="nav-btn" data-view="dashboard">📊 לוח מחוונים</button>
                <button class="nav-btn" data-view="posts">📢 הודעות וחדשות</button>
                <button class="nav-btn" data-view="assignments">📝 משימות</button>
            `;
            
            // (חדש) גם מנהל יכול לנהל משימות
            if (currentUser.role === 'teacher' || currentUser.role === 'admin') {
                navLinks += `<button class="nav-btn" data-view="createAssignment">➕ ניהול משימות</button>`;
            }
            
            if (currentUser.role === 'admin') {
                navLinks += `
                    <button class="nav-btn" data-view="users">👥 ניהול משתמשים</button>
                    <button class="nav-btn" data-view="classes">🏫 ניהול כיתות</button>
                `;
            }
        }
        
        navEl.innerHTML = navLinks;
    }

    // --- Navigation & View Loading ---
    function handleNavClick(e) {
        if (e.target.matches('.nav-btn')) {
            const viewName = e.target.dataset.view;
            if (viewName) {
                loadView(viewName);
            }
        }
    }
    
    function handleAuthClick(e) {
        if (e.target.id === 'logout-btn') {
            logout();
        }
        if (e.target.matches('.nav-btn')) {
            const viewName = e.target.dataset.view;
            if (viewName) {
                loadView(viewName);
            }
        }
    }

    async function logout() {
        await fetch('/api/logout', { method: 'POST' });
        state.currentUser = null;
        renderLayout();
        loadView('publicPosts'); // חזרה לעמוד הציבורי
    }

    function loadView(viewName) {
        // עדכון כפתור פעיל
        document.querySelectorAll('.app-nav .nav-btn, .header-user .nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        // בדיקת הרשאות בסיסית
        if (!state.currentUser && !['publicPosts', 'dashboard'].includes(viewName)) {
            return loadView('publicPosts'); // אם לא מחובר, הפנה לעמוד ציבורי
        }

        switch (viewName) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'publicPosts':
                loadPublicPosts();
                break;
            case 'posts':
                loadPosts();
                break;
            case 'assignments':
                loadAssignments();
                break;
            case 'createAssignment':
                loadCreateAssignmentForm();
                break;
            case 'users':
                loadUsers();
                break;
            case 'classes':
                loadClasses();
                break;
            case 'profile':
                loadProfile();
                break;
            default:
                loadDashboard();
        }
    }

    // --- View Renderers ---
    function render(html) {
        contentEl.innerHTML = html;
    }
    
    function showLoading() {
        render('<div class="loading-spinner">טוען נתונים...</div>');
    }

    function loadDashboard() {
        if (!state.currentUser) {
            return loadView('publicPosts'); // אם לא מחובר, הצג הודעות כלליות
        }

        let classInfo = '';
        // (חדש) תמיכה בריבוי כיתות
        if (state.currentUser.role === 'student') {
            const classNames = state.currentUser.classIds ? state.currentUser.classIds.join(', ') : 'אין';
            classInfo = `<h3>🎒 כיתות משויכות: ${classNames || 'אין'}</h3>`;
        }

        render(`
            <section class="view">
                <h2>📊 לוח מחוונים</h2>
                ${classInfo}
                <p>🎉 ברוך הבא למערכת, ${state.currentUser.fullname}!</p>
                <p>כאן תוכל למצוא עדכונים חשובים, משימות אחרונות ונתונים אישיים.</p>
                <div class="dashboard-actions">
                    <button class="btn-primary" data-action="nav-to" data-view="posts">📢 צפה בהודעות אחרונות</button>
                    <button class="btn-primary" data-action="nav-to" data-view="assignments">📝 צפה במשימות פתוחות</button>
                </div>
            </section>
        `);
    }

    async function loadPublicPosts() {
        showLoading();
        try {
            const res = await fetch('/api/posts');
            const posts = await res.json();
            
            const postsHtml = posts.length > 0
                ? posts.map(post => `
                    <article class="item-card">
                        <h3>📝 ${post.title}</h3>
                        <p>${post.content}</p>
                        <small>👤 פורסם על ידי ${post.authorName} 📅 ${new Date(post.date).toLocaleDateString('he-IL')}</small>
                    </article>
                `).join('')
                : '<p>אין הודעות כלליות להצגה.</p>';

            render(`
                <section class="view">
                    <h2>📢 הודעות כלליות</h2>
                    ${!state.currentUser ? `
                        <p>🎓 ברוכים הבאים למערכת</p>
                        <p>🔒 כדי לצפות בתוכן מלא, אנא <a href="login.html">התחבר</a>.</p>
                    ` : ''}
                    <div class="item-list">
                        ${postsHtml}
                    </div>
                </section>
            `);
        } catch (error) {
            renderError('טעינת ההודעות נכשלה.');
        }
    }

    async function loadPosts() {
        showLoading();
        const canPost = state.currentUser.role === 'admin' || state.currentUser.role === 'teacher';
        
        try {
            const res = await fetch('/api/posts');
            const posts = await res.json();
            
            const postsHtml = posts.length > 0
                ? posts.map(post => `
                    <article class="item-card">
                        <div class="item-header">
                            <h3>📝 ${post.title} ${post.isPrivate ? `(🏫 כיתה ${post.classId})` : '(כללי)'}</h3>
                            ${state.currentUser.role === 'admin' || state.currentUser.id === post.authorId ?
                            `<button class="btn-danger btn-small" data-action="delete-post" data-id="${post.id}">🗑️ מחק</button>` : ''}
                        </div>
                        <p>${post.content}</p>
                        <small>👤 פורסם על ידי ${post.authorName} 📅 ${new Date(post.date).toLocaleDateString('he-IL')}</small>
                    </article>
                `).join('')
                : '<p>אין הודעות להצגה.</p>';

            render(`
                <section class="view">
                    <h2>📢 הודעות וחדשות</h2>
                    ${canPost ? `
                        <button class="btn-primary" data-action="show-add-post-form">➕ הוסף הודעה</button>
                        <form id="add-post-form" class="form-grid" style="display:none;">
                            <h3>הוספת הודעה חדשה</h3>
                            <div class="form-group">
                                <label for="post-title">כותרת:</label>
                                <input type="text" id="post-title" required>
                            </div>
                            <div class="form-group">
                                <label for="post-content">תוכן:</label>
                                <textarea id="post-content" rows="4" required></textarea>
                            </div>
                            <div class="form-group-inline">
                                <input type="checkbox" id="post-isPrivate">
                                <label for="post-isPrivate">הודעה כיתתית?</label>
                            </div>
                            <button type="submit">➕ פרסם הודעה</button>
                        </form>
                    ` : ''}
                    <div class="item-list">
                        ${postsHtml}
                    </div>
                </section>
            `);
        } catch (error) {
            renderError('טעינת ההודעות נכשלה.');
        }
    }

    async function loadAssignments() {
        showLoading();
        const userRole = state.currentUser.role;
        const isStudent = userRole === 'student';
        const canManage = userRole === 'admin' || userRole === 'teacher';
        
        try {
            const res = await fetch('/api/assignments');
            state.assignments = await res.json(); // שמירה בסטייט
            
            const assignmentsHtml = state.assignments.length > 0
                ? state.assignments.map(a => {
                    
                    // (חדש) בניית HTML נפרד להגשות
                    let submissionHtml = '';
                    if (isStudent) {
                        submissionHtml = `
                            <form class="submit-assignment-form" data-id="${a.id}">
                                <div class="form-group">
                                    <label for="submission-${a.id}">📤 הגש מטלה (קובץ):</label>
                                    <input type="file" id="submission-${a.id}" name="submissionFile" required>
                                </div>
                                <button type="submit" class="btn-primary btn-small">הגש</button>
                            </form>
                        `;
                    } else if (canManage) {
                        // (חדש) תצוגת הגשות למורה/מנהל
                        submissionHtml = `
                            <h4>הגשות תלמידים (${a.submissions.length}):</h4>
                            ${a.submissions.length > 0 ? `
                                <ul class="submissions-list">
                                    ${a.submissions.map(sub => `
                                        <li>
                                            <strong>${sub.studentName}</strong>: 
                                            <a href="/uploads/${sub.file.filename}" target="_blank">📥 צפה בקובץ</a>
                                            <small>(${new Date(sub.date).toLocaleString('he-IL')})</small>
                                        </li>
                                    `).join('')}
                                </ul>
                            ` : '<p><small>אין הגשות למשימה זו.</small></p>'}
                        `;
                    }

                    return `
                        <article class="item-card">
                            <div class="item-header">
                                <h3>📚 ${a.title} - 🏫 כיתה ${a.classId}</h3>
                                ${canManage ?
                                `<button class="btn-danger btn-small" data-action="delete-assignment" data-id="${a.id}">🗑️ מחק</button>` 
                                : ''}
                            </div>
                            <p>📋 <strong>תיאור:</strong> ${a.description}</p>
                            <p><small>⏰ <strong>מועד הגשה:</strong> ${new Date(a.dueDate).toLocaleDateString('he-IL')}</small></p>
                            <p><small>👨‍🏫 <strong>מורה:</strong> ${a.teacherName}</small></p>
                            ${submissionHtml}
                        </article>
                    `;
                }).join('')
                : '<p>אין משימות להצגה.</p>';

            render(`
                <section class="view">
                    <h2>📝 משימות</h2>
                    <div class="item-list">
                        ${assignmentsHtml}
                    </div>
                </section>
            `);
        } catch (error) {
            renderError('טעינת המשימות נכשלה.');
        }
    }

    async function loadCreateAssignmentForm() {
        showLoading();
        try {
            const res = await fetch('/api/classes');
            const classes = await res.json();
            const classOptions = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

            render(`
                <section class="view">
                    <h2>➕ יצירת משימה חדשה</h2>
                    <form id="add-assignment-form" class="form-grid">
                        <div class="form-group">
                            <label for="assign-title">כותרת המשימה:</label>
                            <input type="text" id="assign-title" required>
                        </div>
                        <div class="form-group">
                            <label for="assign-classId">כיתת יעד:</label>
                            <select id="assign-classId" required>
                                <option value="">בחר כיתה...</option>
                                ${classOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="assign-dueDate">מועד הגשה:</label>
                            <input type="date" id="assign-dueDate" required>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label for="assign-desc">תיאור המשימה:</label>
                            <textarea id="assign-desc" rows="5" required></textarea>
                        </div>
                        <button type="submit">➕ צור משימה</button>
                    </form>
                </section>
            `);
        } catch (error) {
            renderError('טעינת טופס המשימות נכשלה.');
        }
    }

    async function loadUsers() {
        showLoading();
        try {
            const [usersRes, classesRes] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/classes')
            ]);
            state.users = await usersRes.json();
            state.classes = await classesRes.json();

            const classOptions = state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

            const usersHtml = state.users.map(user => {
                // (חדש) טיפול במשתמש מוגן + כפתור עריכה
                const protectedUser = user.email === 'yairfrish2@gmail.com';
                const actionsHtml = protectedUser
                    ? '<span>(משתמש מוגן)</span>'
                    : `
                        <button class="btn-primary btn-small" data-action="show-edit-user-form" data-id="${user.id}" data-user='${JSON.stringify(user)}'>✏️ ערוך</button>
                        <button class="btn-danger btn-small" data-action="delete-user" data-id="${user.id}">🗑️ מחק</button>
                    `;
                
                return `
                    <tr>
                        <td>${user.fullname}</td>
                        <td>${user.email}</td>
                        <td>${translateRole(user.role)}</td>
                        <td>${(user.classIds && user.classIds.length > 0) ? user.classIds.join(', ') : '-'}</td>
                        <td>${actionsHtml}</td>
                    </tr>
                `;
            }).join('');

            render(`
                <section class="view">
                    <h2>👥 ניהול משתמשים</h2>
                    <button class="btn-primary" data-action="show-add-user-form">➕ הוסף משתמש חדש</button>
                    
                    <form id="add-user-form" class="form-grid" style="display:none;">
                        <h3>יצירת משתמש חדש</h3>
                        <div class="form-group">
                            <label for="user-fullname">שם מלא:</label>
                            <input type="text" id="user-fullname" required>
                        </div>
                        <div class="form-group">
                            <label for="user-email">אימייל:</label>
                            <input type="email" id="user-email" required>
                        </div>
                        <div class="form-group">
                            <label for="user-password">סיסמה:</label>
                            <input type="password" id="user-password" required>
                        </div>
                        <div class="form-group">
                            <label for="user-role">תפקיד:</label>
                            <select id="user-role" required>
                                <option value="student">תלמיד</option>
                                <option value="teacher">מורה</option>
                                <option value="admin">מנהל</option>
                            </select>
                        </div>
                        <div class="form-group" id="user-class-group">
                            <label for="user-classId">כיתות (עד 10, החזק Ctrl/Cmd לבחירה מרובה):</label>
                            <select id="user-classId" multiple size="5">
                                ${classOptions}
                            </select>
                        </div>
                        <button type="submit">➕ הוסף משתמש</button>
                    </form>

                    <form id="edit-user-form" class="form-grid" style="display:none;">
                        <h3>עריכת משתמש</h3>
                        <input type="hidden" id="edit-user-id">
                        <div class="form-group">
                            <label for="edit-user-fullname">שם מלא:</label>
                            <input type="text" id="edit-user-fullname" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-user-email">אימייל:</label>
                            <input type="email" id="edit-user-email" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-user-password">סיסמה חדשה (השאר ריק לא לשנות):</label>
                            <input type="password" id="edit-user-password">
                        </div>
                        <div class="form-group">
                            <label for="edit-user-role">תפקיד:</label>
                            <select id="edit-user-role" required>
                                <option value="student">תלמיד</option>
                                <option value="teacher">מורה</option>
                                <option value="admin">מנהל</option>
                            </select>
                        </div>
                        <div class="form-group" id="edit-user-class-group">
                            <label for="edit-user-classId">כיתות (עד 10, החזק Ctrl/Cmd לבחירה מרובה):</label>
                            <select id="edit-user-classId" multiple size="5">
                                ${classOptions}
                            </select>
                        </div>
                        <button type="submit">💾 שמור שינויים</button>
                    </form>

                    <h3>רשימת משתמשים</h3>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>שם מלא</th>
                                    <th>אימייל</th>
                                    <th>תפקיד</th>
                                    <th>כיתות</th>
                                    <th>פעולות</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${usersHtml}
                            </tbody>
                        </table>
                    </div>
                </section>
            `);
        } catch (error) {
            renderError('טעינת המשתמשים נכשלה.');
        }
    }
    
    async function loadClasses() {
        showLoading();
        try {
            const [classesRes, usersRes] = await Promise.all([
                fetch('/api/classes'),
                fetch('/api/users') // נדרש לשמות המורים
            ]);
            state.classes = await classesRes.json();
            state.users = await usersRes.json();
            
            const teachers = state.users.filter(u => u.role === 'teacher');
            const teacherOptions = teachers.map(t => `<option value="${t.id}">${t.fullname}</option>`).join('');

            const classesHtml = state.classes.map(c => {
                const teacher = state.users.find(u => u.id === c.teacherId);
                return `
                    <article class="item-card">
                        <div class="item-header">
                            <h3>🏫 ${c.name} (שכבה ${c.grade})</h3>
                            <button class="btn-danger btn-small" data-action="delete-class" data-id="${c.id}">🗑️ מחק</button>
                        </div>
                        <p>👨‍🏫 <strong>מורה:</strong> ${teacher ? teacher.fullname : 'ללא שיוך'}</p>
                        <p>👥 <strong>מספר תלמידים:</strong> ${c.students.length}</p>
                    </article>
                `;
            }).join('');

            render(`
                <section class="view">
                    <h2>🏫 ניהול כיתות</h2>
                    <button class="btn-primary" data-action="show-add-class-form">➕ הוסף כיתה חדשה</button>
                    <form id="add-class-form" class="form-grid" style="display:none;">
                        <h3>יצירת כיתה חדשה</h3>
                        <div class="form-group">
                            <label for="class-name">שם כיתה:</label>
                            <input type="text" id="class-name" required>
                        </div>
                        <div class="form-group">
                            <label for="class-grade">שכבה:</label>
                            <input type="text" id="class-grade" required>
                        </div>
                         <div class="form-group">
                            <label for="class-teacherId">שיוך מורה:</label>
                            <select id="class-teacherId">
                                <option value="">בחר מורה...</option>
                                ${teacherOptions}
                            </select>
                        </div>
                        <button type="submit">➕ הוסף כיתה</button>
                    </form>

                    <h3>רשימת כיתות</h3>
                    <div class="item-list">
                        ${classesHtml}
                    </div>
                </section>
            `);
        } catch (error) {
            renderError('טעינת הכיתות נכשלה.');
        }
    }
    
    function loadProfile() {
        // (חדש) תמיכה בריבוי כיתות
        const { fullname, email, role, classIds, id } = state.currentUser;
        render(`
            <section class="view">
                <h2>👤 עריכת פרופיל אישי</h2>
                <form id="update-profile-form" class="form-grid">
                    <div class="form-group">
                        <label for="profile-fullname">שם מלא:</label>
                        <input type="text" id="profile-fullname" value="${fullname}" required>
                    </div>
                    <div class="form-group">
                        <label for="profile-email">אימייל:</label>
                        <input type="email" id="profile-email" value="${email}" required>
                    </div>
                    <div class="form-group">
                        <label for="profile-password">סיסמה חדשה (לא חובה):</label>
                        <input type="password" id="profile-password" placeholder="השאר ריק כדי לא לשנות">
                    </div>
                    <button type="submit">💾 שמור שינויים</button>
                </form>
                
                <h3>👤 פרטים אישיים</h3>
                <ul class="details-list">
                    <li><strong>🎭 תפקיד:</strong> ${translateRole(role)}</li>
                    ${(classIds && classIds.length > 0) ? `<li><strong>🏫 כיתות:</strong> ${classIds.join(', ')}</li>` : ''}
                    <li><strong>🆔 מזהה משתמש:</strong> ${id}</li>
                </ul>
            </section>
        `);
    }
    
    function renderError(message) {
        render(`<div class="message error">${message}</div>`);
    }
    
    // --- Event Handlers (Delegation) ---
    function handleContentClick(e) {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        
        if (action === 'nav-to') {
            loadView(e.target.dataset.view);
        }
        
        // פתיחת טפסים
        if (action === 'show-add-post-form') {
            document.getElementById('add-post-form').style.display = 'grid';
            e.target.style.display = 'none';
        }
        if (action === 'show-add-user-form') {
            document.getElementById('add-user-form').style.display = 'grid';
            e.target.style.display = 'none';
            document.getElementById('edit-user-form').style.display = 'none'; // הסתר עריכה
        }
        if (action === 'show-add-class-form') {
            document.getElementById('add-class-form').style.display = 'grid';
            e.target.style.display = 'none';
        }

        // (חדש) פתיחת טופס עריכת משתמש
        if (action === 'show-edit-user-form') {
            const user = JSON.parse(e.target.dataset.user);
            
            document.getElementById('edit-user-id').value = user.id;
            document.getElementById('edit-user-fullname').value = user.fullname;
            document.getElementById('edit-user-email').value = user.email;
            document.getElementById('edit-user-role').value = user.role;
            document.getElementById('edit-user-password').value = ''; // נקה שדה סיסמה
            
            // (חדש) בחירת כיתות קיימות
            const classSelect = document.getElementById('edit-user-classId');
            Array.from(classSelect.options).forEach(opt => {
                opt.selected = user.classIds && user.classIds.includes(parseInt(opt.value));
            });

            document.getElementById('edit-user-form').style.display = 'grid';
            document.getElementById('add-user-form').style.display = 'none'; // הסתר הוספה
        }

        // פעולות מחיקה
        if (action === 'delete-user') {
            if (confirm('האם אתה בטוח שברצונך למחוק משתמש זה?')) {
                deleteItem(`/api/users/${id}`, 'משתמש נמחק בהצלחה', loadUsers);
            }
        }
        if (action === 'delete-post') {
            if (confirm('האם אתה בטוח שברצונך למחוק הודעה זו?')) {
                deleteItem(`/api/posts/${id}`, 'הודעה נמחקה בהצלחה', loadPosts);
            }
        }
        if (action === 'delete-assignment') {
            if (confirm('האם אתה בטוח שברצונך למחוק משימה זו? פעולה זו תמחק גם את כל ההגשות של התלמידים.')) {
                deleteItem(`/api/assignments/${id}`, 'משימה נמחקה בהצלחה', loadAssignments);
            }
        }
        // (חדש) מחיקת כיתה
        if (action === 'delete-class') {
             if (confirm('האם אתה בטוח שברצונך למחוק כיתה זו? פעולה זו תסיר את כל התלמידים המשויכים אליה.')) {
                deleteItem(`/api/classes/${id}`, 'כיתה נמחקה בהצלחה', loadClasses);
            }
        }
    }
    
    async function deleteItem(url, successMessage, callback) {
        try {
            const res = await fetch(url, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showNotification(successMessage, 'success');
            callback();
        } catch (error) {
            showNotification(error.message || 'פעולת המחיקה נכשלה.', 'error');
        }
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        
        try {
            if (form.id === 'add-user-form') {
                // (חדש) קבלת מערך כיתות
                const selectedClasses = Array.from(form['user-classId'].selectedOptions).map(opt => opt.value);
                if (selectedClasses.length > 10) {
                    return showNotification('לא ניתן לבחור יותר מ-10 כיתות.', 'error');
                }
                const body = {
                    fullname: form['user-fullname'].value,
                    email: form['user-email'].value,
                    password: form['user-password'].value,
                    role: form['user-role'].value,
                    classIds: selectedClasses
                };
                await postForm('/api/users', body, 'משתמש נוצר בהצלחה', loadUsers);
            }
            
            // (חדש) טופס עריכת משתמש
            if (form.id === 'edit-user-form') {
                const id = form['edit-user-id'].value;
                const selectedClasses = Array.from(form['edit-user-classId'].selectedOptions).map(opt => opt.value);
                if (selectedClasses.length > 10) {
                    return showNotification('לא ניתן לבחור יותר מ-10 כיתות.', 'error');
                }
                const body = {
                    fullname: form['edit-user-fullname'].value,
                    email: form['edit-user-email'].value,
                    role: form['edit-user-role'].value,
                    classIds: selectedClasses
                };
                if (form['edit-user-password'].value) {
                    body.password = form['edit-user-password'].value;
                }
                await putForm(`/api/users/${id}`, body, 'משתמש עודכן בהצלחה', loadUsers);
            }
            
            if (form.id === 'add-class-form') {
                const body = {
                    name: form['class-name'].value,
                    grade: form['class-grade'].value,
                    teacherId: form['class-teacherId'].value || null
                };
                await postForm('/api/classes', body, 'כיתה נוצרה בהצלחה', loadClasses);
            }

            if (form.id === 'add-post-form') {
                const body = {
                    title: form['post-title'].value,
                    content: form['post-content'].value,
                    isPrivate: form['post-isPrivate'].checked,
                    // (חדש) תמיכה בריבוי כיתות - שולח את הכיתה הראשונה של המורה
                    classId: form['post-isPrivate'].checked ? (state.currentUser.classIds ? state.currentUser.classIds[0] : null) : null
                };
                await postForm('/api/posts', body, 'הודעה פורסמה בהצלחה', loadPosts);
            }
            
            if (form.id === 'add-assignment-form') {
                const body = {
                    title: form['assign-title'].value,
                    description: form['assign-desc'].value,
                    dueDate: form['assign-dueDate'].value,
                    classId: form['assign-classId'].value
                };
                await postForm('/api/assignments', body, 'משימה נוצרה בהצלחה', loadAssignments);
            }
            
            if (form.id === 'update-profile-form') {
                const body = {
                    fullname: form['profile-fullname'].value,
                    email: form['profile-email'].value
                };
                if (form['profile-password'].value) {
                    body.password = form['profile-password'].value;
                }
                
                const res = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                
                state.currentUser = data; // עדכון הסטייט המקומי
                renderHeader(); // עדכון ההדר
                loadProfile(); // טעינה מחדש של הפרופיל
                showNotification('הפרופיל עודכן בהצלחה!', 'success');
            }
            
            if (form.classList.contains('submit-assignment-form')) {
                const id = form.dataset.id;
                const fileInput = form.querySelector('input[type="file"]');
                
                if (!fileInput.files || fileInput.files.length === 0) {
                    showNotification('יש לבחור קובץ להגשה.', 'error');
                    return;
                }
                
                const formData = new FormData();
                formData.append('submissionFile', fileInput.files[0]);
                
                const res = await fetch(`/api/assignments/${id}/submit`, {
                    method: 'POST',
                    body: formData 
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                showNotification(data.message, 'success');
                loadAssignments(); // (חדש) רענון רשימת המשימות להצגת ההגשה
            }

        } catch (error) {
            console.error('Form Error:', error);
            showNotification(error.message || 'אירעה שגיאה.', 'error');
        }
    }
    
    async function postForm(url, body, successMessage, callback) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification(successMessage, 'success');
        callback(); 
    }
    
    // (חדש) פונקציית PUT
    async function putForm(url, body, successMessage, callback) {
         const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification(successMessage, 'success');
        callback(); 
    }


    // --- Helpers ---
    function translateRole(role) {
        switch (role) {
            case 'admin': return 'מנהל';
            case 'teacher': return 'מורה';
            case 'student': return 'תלמיד';
            default: return role;
        }
    }
    
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationArea.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // --- Start ---
    initializeApp();
});
