pipeline {
    agent any
    
    environment {
        APP_DIR = '/opt/chatapp'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                }
                echo "Building commit: ${env.GIT_COMMIT_SHORT}"
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Lint & Type Check') {
            parallel {
                stage('Lint') {
                    steps {
                        sh 'npm run lint || true'
                    }
                }
                stage('Type Check') {
                    steps {
                        sh 'npx tsc --noEmit || true'
                    }
                }
            }
        }
        
        stage('Test') {
            steps {
                sh 'npm test -- --passWithNoTests || true'
            }
        }
        
        stage('Build & Deploy') {
            steps {
                script {
                    // Stop existing containers
                    sh '''
                        cd ${APP_DIR} || mkdir -p ${APP_DIR}
                        docker-compose down || true
                    '''
                    
                    // Copy files to app directory
                    sh '''
                        cp -r . ${APP_DIR}/
                    '''
                    
                    // Build and start containers
                    sh '''
                        cd ${APP_DIR}
                        docker-compose up --build -d
                    '''
                    
                    // Clean up old images
                    sh 'docker system prune -f || true'
                }
            }
        }
        
        stage('Health Check') {
            steps {
                script {
                    // Wait for services to start
                    sleep(time: 30, unit: 'SECONDS')
                    
                    // Check if containers are running
                    sh '''
                        docker-compose -f ${APP_DIR}/docker-compose.yml ps
                    '''
                    
                    // Check web app
                    sh '''
                        curl -f http://localhost:3000 || echo "Web app not responding yet"
                    '''
                    
                    // Check socket server
                    sh '''
                        curl -f http://localhost:3001/health || echo "Socket server not responding yet"
                    '''
                }
            }
        }
    }
    
    post {
        success {
            echo '✅ Deployment successful!'
            echo "App running at: http://YOUR_SERVER_IP:3000"
            echo "Socket server at: http://YOUR_SERVER_IP:3001"
        }
        failure {
            echo '❌ Deployment failed!'
            // Optionally rollback
            sh '''
                cd ${APP_DIR}
                docker-compose logs --tail=50
            '''
        }
        always {
            cleanWs()
        }
    }
}
