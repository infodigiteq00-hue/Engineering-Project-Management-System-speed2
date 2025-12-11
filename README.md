# 🏗️ Equipment Overview - Core UI

A professional team management system for equipment oversight with VDCR management, project tracking, and role-based access control.

## ✨ Features

- **Team Management**: Add, edit, and manage team members with role-based permissions
- **VDCR System**: Complete VDCR document management and workflow
- **Project Management**: Create and manage projects with equipment assignments
- **Equipment Tracking**: Monitor equipment progress and team assignments
- **Professional UI**: Modern, elegant interface built with React and Tailwind CSS
- **Role-Based Access**: Secure permission system for different user types

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation
```bash
# Clone the repository
git clone [YOUR_REPOSITORY_URL]
cd equip-overview-now-CORE-UI

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

## 🛠️ Development Workflow

### For Frontend Developers
```bash
# Make changes to code
# Stage changes
git add .

# Commit changes
git commit -m "Description of changes"

# Push to remote
git push origin main
```

### For Backend Developers
```bash
# Pull latest changes
git pull origin main

# Install dependencies (if package.json changed)
npm install

# Start development
npm run dev
```

## 📁 Project Structure

```
src/
├── components/
│   ├── dashboard/          # Main dashboard components
│   ├── forms/             # Form components
│   └── ui/                # Reusable UI components
├── pages/                  # Page components
├── lib/                    # Utilities and configurations
└── assets/                 # Images and static files
```

## 🔐 Role System

### Project Manager
- Full project access and team management
- Can edit all data (except VDCR)
- Add/remove team members

### VDCR Manager
- VDCR tab access and management
- Can edit VDCR documents
- Access to VDCR Birdview and logs

### Editor
- Assigned equipment only
- Can add progress images and entries
- Access to VDCR & other tabs
- No access to Settings & Project Details

### Viewer
- Assigned equipment only
- Read-only access
- Cannot edit data
- Access to VDCR & other tabs
- No access to Settings & Project Details

## 🎨 UI Components

Built with:
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Radix UI** for accessible components
- **Vite** for fast development

## 📝 Adding New Features

1. **Create feature branch**: `git checkout -b feature/new-feature`
2. **Develop and test** your changes
3. **Commit changes**: `git commit -m "Add new feature"`
4. **Push branch**: `git push origin feature/new-feature`
5. **Create pull request** for review

## 🔄 Team Collaboration

### Sharing Updates
- **No more zip files!** Use Git instead
- **Pull latest changes**: `git pull origin main`
- **See what changed**: `git log --oneline`
- **Rollback if needed**: `git reset --hard HEAD~1`

### Best Practices
- Always pull before starting work
- Commit frequently with clear messages
- Test changes before pushing
- Communicate with team about major changes

## 🚨 Troubleshooting

### Common Issues
- **Port already in use**: Try `npm run dev` on different port
- **Dependencies issues**: Delete `node_modules` and run `npm install`
- **Build errors**: Check TypeScript errors with `npm run build`

### Getting Help
1. Check the Git log for recent changes
2. Verify all dependencies are installed
3. Check console for error messages
4. Contact the team for assistance

## 📞 Support

For questions or issues:
- Check this README first
- Review recent Git commits
- Contact the development team

---

**Happy Coding! 🎯**
