#!/bin/bash

# SecureShare Docker Production Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker."
        exit 1
    fi
}

# Check if .env file exists
check_env() {
    if [ ! -f .env ]; then
        print_error ".env file not found!"
        print_status "Please copy docker.env.template to .env and configure it:"
        echo "  cp docker.env.template .env"
        echo "  nano .env"
        exit 1
    fi
}

# Build production containers
build_prod() {
    print_status "Building production containers..."
    docker-compose build --no-cache
    print_success "Production containers built successfully!"
}

# Start production environment
start_prod() {
    print_status "Starting production environment..."
    docker-compose up -d
    
    print_status "Waiting for services to be ready..."
    sleep 15
    
    print_success "Production environment started!"
    print_status "Services available at:"
    echo "  🌐 Frontend: http://localhost:3000"
    echo "  🚀 Backend API: http://localhost:8000"
    echo "  📊 API Health: http://localhost:8000/api/health"
    echo "  🗄️  MongoDB: mongodb://localhost:27017"
    echo "  🔄 Redis: redis://localhost:6379"
}

# Start production with proxy
start_with_proxy() {
    print_status "Starting production environment with nginx proxy..."
    docker-compose --profile production up -d
    
    print_status "Waiting for services to be ready..."
    sleep 20
    
    print_success "Production environment with proxy started!"
    print_status "Services available at:"
    echo "  🌐 Frontend: http://localhost"
    echo "  🔒 HTTPS: https://localhost (if SSL configured)"
    echo "  📊 API Health: http://localhost/api/health"
}

# Stop production environment
stop_prod() {
    print_status "Stopping production environment..."
    docker-compose down
    print_success "Production environment stopped!"
}

# View logs
logs_prod() {
    if [ -z "$2" ]; then
        docker-compose logs -f --tail=100
    else
        docker-compose logs -f --tail=100 "$2"
    fi
}

# Restart production environment
restart_prod() {
    print_status "Restarting production environment..."
    stop_prod
    start_prod
}

# Backup database
backup_db() {
    print_status "Creating database backup..."
    
    # Create backup directory if it doesn't exist
    mkdir -p backups
    
    # Generate backup filename with timestamp
    BACKUP_FILE="backups/secureshare_backup_$(date +%Y%m%d_%H%M%S).gz"
    
    # Create backup
    docker-compose exec -T secureshare-db mongodump --archive --gzip --db secureshare > "$BACKUP_FILE"
    
    print_success "Database backup created: $BACKUP_FILE"
}

# Restore database
restore_db() {
    if [ -z "$2" ]; then
        print_error "Please specify backup file path"
        print_status "Usage: $0 restore <backup_file>"
        exit 1
    fi
    
    if [ ! -f "$2" ]; then
        print_error "Backup file not found: $2"
        exit 1
    fi
    
    print_warning "This will restore the database from backup and overwrite existing data!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Restoring database from: $2"
        docker-compose exec -T secureshare-db mongorestore --archive --gzip --drop < "$2"
        print_success "Database restored successfully!"
    else
        print_status "Restore cancelled."
    fi
}

# Update containers
update_prod() {
    print_status "Updating production containers..."
    docker-compose pull
    docker-compose up -d --force-recreate
    print_success "Production containers updated!"
}

# Clean up production environment
clean_prod() {
    print_warning "This will remove all production containers, networks, and volumes!"
    print_warning "This will DELETE ALL DATA including uploaded files and database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up production environment..."
        docker-compose down -v --remove-orphans
        docker system prune -f
        print_success "Production environment cleaned up!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Show help
show_help() {
    echo "SecureShare Docker Production Manager"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build        Build production containers"
    echo "  start        Start production environment"
    echo "  start-proxy  Start with nginx reverse proxy"
    echo "  stop         Stop production environment"
    echo "  restart      Restart production environment"
    echo "  logs         View logs (add service name for specific service)"
    echo "  update       Update containers to latest versions"
    echo "  backup       Create database backup"
    echo "  restore      Restore database from backup"
    echo "  clean        Clean up production environment (DANGEROUS)"
    echo "  status       Show container status"
    echo "  shell        Open shell in container (requires service name)"
    echo "  help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs secureshare-server"
    echo "  $0 backup"
    echo "  $0 restore backups/secureshare_backup_20231201_120000.gz"
}

# Show container status
show_status() {
    print_status "Production environment status:"
    docker-compose ps
}

# Open shell in container
open_shell() {
    if [ -z "$2" ]; then
        print_error "Please specify a service name (e.g., secureshare-server)"
        exit 1
    fi
    
    print_status "Opening shell in $2..."
    docker-compose exec "$2" /bin/sh
}

# Main script logic
case "$1" in
    build)
        check_docker
        check_env
        build_prod
        ;;
    start)
        check_docker
        check_env
        start_prod
        ;;
    start-proxy)
        check_docker
        check_env
        start_with_proxy
        ;;
    stop)
        check_docker
        stop_prod
        ;;
    restart)
        check_docker
        check_env
        restart_prod
        ;;
    logs)
        check_docker
        logs_prod "$@"
        ;;
    update)
        check_docker
        check_env
        update_prod
        ;;
    backup)
        check_docker
        backup_db
        ;;
    restore)
        check_docker
        restore_db "$@"
        ;;
    clean)
        check_docker
        clean_prod
        ;;
    status)
        check_docker
        show_status
        ;;
    shell)
        check_docker
        open_shell "$@"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac 