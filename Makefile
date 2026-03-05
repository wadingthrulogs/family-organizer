SHELL := /bin/bash

# Auto-detect docker compose plugin vs standalone
COMPOSE := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# Backup directory
BACKUP_DIR := ./backups

# Current timestamp for backup filenames
TIMESTAMP := $(shell date +%Y%m%d-%H%M%S)

.PHONY: help setup reconfigure tailscale-setup tailscale-renew up down restart logs status backup restore update shell-backend

## help: Print available commands (default target)
help:
	@printf "\n  \033[1mFamily Organizer — available commands\033[0m\n\n"
	@grep -E '^## [a-z]' Makefile | sed 's/## //' | \
	  awk -F': ' '{printf "  \033[36mmake %-20s\033[0m %s\n", $$1, $$2}'
	@printf "\n"

## setup: Start the app (runs wizard on first use, quick-restart thereafter)
setup:
	@bash setup.sh

## reconfigure: Re-run the setup wizard to change configuration
reconfigure:
	@bash setup.sh --reconfigure

## tailscale-setup: Re-run Tailscale HTTPS setup (host-based standalone; prefer 'make setup' for new installs)
tailscale-setup:
	@bash tailscale-setup.sh

## tailscale-renew: Renew Tailscale cert inside container and reload nginx (no rebuild)
tailscale-renew:
	@bash tailscale-setup.sh --renew

## up: Build and start all containers
up:
	$(COMPOSE) up -d --build

## down: Stop and remove containers (data volumes are preserved)
down:
	$(COMPOSE) down

## restart: Restart all containers without rebuilding
restart:
	$(COMPOSE) restart

## logs: Follow live container logs (Ctrl-C to stop)
logs:
	$(COMPOSE) logs -f --tail=100

## status: Show container status and backend health
status:
	@printf "\n  \033[1mContainer status\033[0m\n\n"
	@$(COMPOSE) ps
	@printf "\n  \033[1mBackend health\033[0m\n\n"
	@$(COMPOSE) exec backend wget -qO- http://localhost:3000/api/v1/health 2>/dev/null \
	  && printf "\n" \
	  || printf "  \033[33m(backend not responding)\033[0m\n"
	@printf "\n"

## backup: Stop backend, copy DB to ./backups/app-TIMESTAMP.db, restart
backup:
	@mkdir -p $(BACKUP_DIR)
	@printf "  \033[36m→\033[0m  Stopping backend…\n"
	@$(COMPOSE) stop backend
	@printf "  \033[36m→\033[0m  Copying database…\n"
	@$(COMPOSE) cp backend:/data/app.db $(BACKUP_DIR)/app-$(TIMESTAMP).db
	@printf "  \033[32m✓\033[0m  Backup saved to $(BACKUP_DIR)/app-$(TIMESTAMP).db\n"
	@printf "  \033[36m→\033[0m  Starting backend…\n"
	@$(COMPOSE) start backend
	@printf "  \033[32m✓\033[0m  Done.\n"

## restore FILE=path: Restore DB from a backup file (stops and restarts backend)
restore:
ifndef FILE
	$(error Usage: make restore FILE=./backups/app-20260101-120000.db)
endif
	@if [[ ! -f "$(FILE)" ]]; then \
	  printf "  \033[31m✗\033[0m  File not found: $(FILE)\n"; exit 1; \
	fi
	@printf "\n  \033[33m!\033[0m  This will REPLACE the live database with:\n"
	@printf "     \033[1m$(FILE)\033[0m\n\n"
	@printf "  Type YES to confirm: "; \
	read -r CONFIRM; \
	if [[ "$$CONFIRM" != "YES" ]]; then printf "  Aborted.\n\n"; exit 1; fi
	@printf "  \033[36m→\033[0m  Stopping backend…\n"
	@$(COMPOSE) stop backend
	@printf "  \033[36m→\033[0m  Copying backup into container…\n"
	@$(COMPOSE) cp $(FILE) backend:/data/app.db
	@printf "  \033[36m→\033[0m  Starting backend…\n"
	@$(COMPOSE) start backend
	@printf "  \033[32m✓\033[0m  Database restored from $(FILE)\n"

## update: Pull latest code and rebuild containers
update:
	@printf "  \033[36m→\033[0m  Pulling latest code…\n"
	@git pull
	@printf "  \033[36m→\033[0m  Rebuilding containers…\n"
	@$(COMPOSE) up -d --build
	@printf "  \033[32m✓\033[0m  Update complete.\n"

## shell-backend: Open a shell inside the running backend container
shell-backend:
	$(COMPOSE) exec backend sh
