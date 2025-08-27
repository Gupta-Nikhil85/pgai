# PostgREST AI Orchestration Platform (pgai)

pgai is a **SaaS platform** that enables enterprise teams to transform their PostgreSQL databases into **managed, versioned REST APIs** through intelligent **PostgREST orchestration**.

This repository uses a **strict documentation-first approach**. All major changes must be reflected in documentation before implementation.

---

## 📖 Documentation Structure

All project documentation lives in the [`docs-claude/`](./docs-claude) folder. Each file serves a dedicated purpose:

- [`scope.md`](./docs-claude/scope.md) → Defines project boundaries, goals, constraints, and stakeholder requirements.  
- [`product.md`](./docs-claude/product.md) → Captures product requirements, user personas, user stories, and non-functional requirements.  
- [`architecture.md`](./docs-claude/architecture.md) → System architecture diagrams, component interactions, technology stack, scalability, and security.  
- [`feature.md`](./docs-claude/feature.md) → Feature-level specifications, API contracts, schemas, and validation rules.  
- [`implementation.md`](./docs-claude/implementation.md) → Technical implementation details, code structure, testing, deployment, and coding standards.  
- [`engineering.md`](./docs-claude/engineering.md) → Engineering practices, CI/CD, observability, incident response, and team workflows.  

> **Rule:** Documentation is **never optional**. Empty or outdated docs are treated as technical debt.

---

## 🚀 Product Overview

pgai empowers teams with:

- **Instant API Creation** → Connect PostgreSQL, get a managed REST API in minutes.  
- **Visual Management** → GUI-driven PostgREST endpoint & database view management.  
- **Enterprise Versioning** → Endpoint-level versioning with team collaboration.  
- **Future AI Integration** → Natural language → database view generation.  

See [`product.md`](./docs-claude/product.md) for:  
- User Personas (API Team Lead, Backend Developer, Technical PM)  
- Phase 1 User Stories (Connection Management, Schema Discovery, View Management, Endpoint Configuration, API Versioning, Team Collaboration, API Documentation)  
- Non-Functional Requirements (Performance, Security, Usability, Integration)  
- Success Metrics (Adoption, Usage, Business KPIs)  
- Future Phases (Advanced Management, AI Integration)  

---

## 🛠 Development Process

1. **Before Starting Any Work**
   - Read all documentation in order:  
     `scope.md → product.md → architecture.md → feature.md → implementation.md → engineering.md`  
   - Verify alignment with documentation.  
   - Update relevant docs **before coding**.  

2. **During Implementation**
   - Continuously reference documentation.  
   - Update `implementation.md` immediately when decisions change.  
   - Ensure consistency across all docs.  

3. **After Completing Work**
   - Update docs to reflect final changes.  
   - Verify completeness and alignment.  
   - Run mandatory documentation review.  

---

## ✅ Mandatory Checks Before Commit

- [ ] Scope is respected (`scope.md`)  
- [ ] Product requirements are met (`product.md`)  
- [ ] Architecture is followed (`architecture.md`)  
- [ ] Features are specified (`feature.md`)  
- [ ] Implementation matches documentation (`implementation.md`)  
- [ ] Engineering standards are followed (`engineering.md`)  

---

## 📊 Success Metrics

We measure platform success by:  
- **Time to First API** (signup → first working endpoint)  
- **Feature Adoption** (percentage of teams using core features)  
- **Retention** (monthly/annual team retention)  
- **Performance** (95th percentile response < 3s, <0.1% error rate)  

See [`product.md`](./docs-claude/product.md#success-metrics) for details.  

---

## 🤝 Contributing

- All contributions **must include documentation updates**.  
- PRs without aligned documentation will be rejected.  
- Regular documentation reviews are required to maintain accuracy.  

---
