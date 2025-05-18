# Stage 1: Build the application
FROM node:23-alpine AS builder

WORKDIR /usr/src/app

# Copy package.json, package-lock.json, and tsconfig.json
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm install

# Copy the source code
COPY src ./src

# Build the TypeScript project
RUN npm run build

# Stage 2: Create the production image
FROM node:23-alpine@sha256:139be64e98a1374a1c49ee62b23a91f688a37a628422ff8bb9fba94185678ab3

WORKDIR /usr/src/app

# Copy package.json and package-lock.json for installing production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the built application from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy the .env file for default values
COPY .env ./.env

# Expose the port the app runs on (assuming 3000 for Express, adjust if necessary)
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]
