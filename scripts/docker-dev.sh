#!/bin/bash

# SecureShare Docker Development Management Script

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
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
}

# Build development containers
build_dev() {
    print_status "Building development containers..."
    docker-compose -f docker-compose.dev.yml build --no-cache
    print_success "Development containers built successfully!"
}

# Start development environment
start_dev() {
    print_status "Starting development environment..."
    docker-compose -f docker-compose.dev.yml up -d
    
    print_status "Waiting for services to be ready..."
    sleep 10
    
    print_success "Development environment started!"
    print_status "Services available at:"
    echo "  🌐 Frontend: http://localhost:3000"
    echo "  🚀 Backend API: http://localhost:8000"
    echo "  📊 API Health: http://localhost:8000/api/health"
    echo "  🗄️  MongoDB: mongodb://localhost:27017/secureshare_dev"
}

# Stop development environment
stop_dev() {
    print_status "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    print_success "Development environment stopped!"
}

# View logs
logs_dev() {
    if [ -z "$2" ]; then
        docker-compose -f docker-compose.dev.yml logs -f
    else
        docker-compose -f docker-compose.dev.yml logs -f "$2"
    fi
}

# Restart development environment
restart_dev() {
    print_status "Restarting development environment..."
    stop_dev
    start_dev
}

# Clean up development environment
clean_dev() {
    print_warning "This will remove all development containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up development environment..."
        docker-compose -f docker-compose.dev.yml down -v --remove-orphans
        docker system prune -f
        print_success "Development environment cleaned up!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Show help
show_help() {
    echo "SecureShare Docker Development Manager"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build     Build development containers"
    echo "  start     Start development environment"
    echo "  stop      Stop development environment"
    echo "  restart   Restart development environment"
    echo "  logs      View logs (add service name for specific service)"
    echo "  clean     Clean up development environment"
    echo "  status    Show container status"
    echo "  shell     Open shell in container (requires service name)"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs secureshare-server-dev"
    echo "  $0 shell secureshare-server-dev"
}

# Show container status
show_status() {
    print_status "Development environment status:"
    docker-compose -f docker-compose.dev.yml ps
}

# Open shell in container
open_shell() {
    if [ -z "$2" ]; then
        print_error "Please specify a service name (e.g., secureshare-server-dev)"
        exit 1
    fi
    
    print_status "Opening shell in $2..."
    docker-compose -f docker-compose.dev.yml exec "$2" /bin/sh
}

# Main script logic
case "$1" in
    build)
        check_docker
        build_dev
        ;;
    start)
        check_docker
        start_dev
        ;;
    stop)
        check_docker
        stop_dev
        ;;
    restart)
        check_docker
        restart_dev
        ;;
    logs)
        check_docker
        logs_dev "$@"
        ;;
    clean)
        check_docker
        clean_dev
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