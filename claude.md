# Claude Code Documentation Framework

## Documentation Structure

This project uses a structured documentation approach in the `docs-claude/` folder. Each file serves a specific purpose and must be maintained according to the processes defined below.

### Documentation Files Overview

#### `docs-claude/scope.md`
**Purpose**: Defines project boundaries, objectives, and constraints
**Content**:
- Project goals and success criteria
- What is explicitly included/excluded from the project
- Technical constraints and limitations
- Timeline and milestone definitions
- Stakeholder requirements

**Process**: Must be updated FIRST before any major feature work begins. All subsequent documentation must align with the defined scope.

#### `docs-claude/product.md`
**Purpose**: Product requirements and user-facing specifications
**Content**:
- User stories and use cases
- Feature requirements and acceptance criteria
- User interface specifications
- Performance requirements
- Business logic requirements

**Process**: Must be updated after scope changes and before architecture decisions. All features must trace back to requirements in this file.

#### `docs-claude/architecture.md`
**Purpose**: High-level system design and component relationships
**Content**:
- System architecture diagrams
- Component interactions and data flow
- Technology stack decisions and rationale
- Scalability and performance considerations
- Security architecture
- Integration patterns

**Process**: Must be updated after product requirements are defined and before implementation planning. All implementation decisions must align with this architecture.

#### `docs-claude/feature.md`
**Purpose**: Detailed feature specifications and behavioral definitions
**Content**:
- Feature breakdown and detailed specifications
- API contracts and interfaces
- Data models and schemas
- Business rules and validation logic
- Error handling specifications

**Process**: Must be updated after architecture is defined and before implementation begins. Each feature must have detailed specifications before coding starts.

#### `docs-claude/implementation.md`
**Purpose**: Technical implementation details and coding guidelines
**Content**:
- Code organization and file structure
- Coding standards and conventions
- Development workflow and practices
- Testing strategies and requirements
- Deployment and build processes
- Technical debt and refactoring notes

**Process**: Must be updated during implementation phase. Should be continuously maintained as implementation decisions are made.

#### `docs-claude/engineering.md`
**Purpose**: Engineering practices, standards, and operational procedures
**Content**:
- Development environment setup
- Code review processes
- Testing methodologies
- CI/CD pipeline specifications
- Monitoring and observability
- Incident response procedures
- Team practices and workflows

**Process**: Must be established early and maintained throughout the project lifecycle. Should be referenced for all engineering decisions.

## Strict Documentation Process

### Before Starting Any Work:

1. **READ ALL DOCUMENTATION FILES** in this order:
   - scope.md
   - product.md  
   - architecture.md
   - feature.md
   - implementation.md
   - engineering.md

2. **VERIFY ALIGNMENT**: Ensure your planned work aligns with existing documentation

3. **UPDATE DOCUMENTATION**: If your work requires changes to any aspect covered by these files, update the relevant documentation BEFORE implementing

### During Implementation:

1. **REFERENCE CONTINUOUSLY**: Check documentation files frequently to ensure compliance
2. **UPDATE IMMEDIATELY**: When implementation details change, update implementation.md immediately
3. **MAINTAIN CONSISTENCY**: Ensure all documentation remains consistent with actual implementation

### After Completing Work:

1. **UPDATE DOCUMENTATION**: Reflect any final changes in the appropriate documentation files
2. **VERIFY COMPLETENESS**: Ensure all documentation accurately reflects the current state
3. **REVIEW ALIGNMENT**: Confirm all files remain consistent with each other

## Mandatory Checks

Before any code commit or major change:

1. All relevant documentation files must be up-to-date
2. Implementation must match the documented architecture
3. Features must align with product requirements
4. Code must follow engineering standards
5. All changes must be within the defined scope

## Documentation Maintenance

- Documentation is NEVER optional
- Empty or outdated documentation files are considered technical debt
- All team members are responsible for maintaining documentation accuracy
- Documentation updates should be part of every feature branch
- Regular documentation reviews should be conducted

## Claude Instructions

When working on this project, Claude must:

1. **ALWAYS read all documentation files before starting any task**
2. **NEVER implement features without corresponding documentation**
3. **UPDATE documentation proactively when making changes**
4. **VERIFY alignment between all documentation files**
5. **REFUSE to proceed if documentation is missing or inconsistent**
6. **ASK for clarification if documentation conflicts with requests**
7. **MAINTAIN the documentation structure and process rigorously**

Remember: Documentation is not just helpful - it's mandatory. No exceptions.