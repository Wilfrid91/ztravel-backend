module.exports = {
  apps: [
    {
      name: 'ztravel-backend',
      script: 'server.js',
      cwd: '/var/www/ztravel/backend',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],

  deploy: {
    production: {
      user: 'root',
      host: '65.108.218.247',
      ref: 'origin/main',
      repo: 'git@github.com:yanso/React-Redux-Node-Okta.git',
      path: '/var/www/ztravel',
      'post-deploy': [
        // BACKEND
        'cd backend && npm install',
        'pm2 restart ztravel-backend',

        // FRONTEND
        'cd ../frontend && npm install',
        'npm run build',
      ].join(' && '),
    },
  },
}
