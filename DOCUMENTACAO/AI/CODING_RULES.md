# CODING RULES

## Regras obrigatorias

- TypeScript obrigatorio
- NestJS no backend
- Prisma como ORM
- modelagem pensando primeiro em PostgreSQL
- codigo orientado a dominio financeiro generico
- nada de acoplamento a escola, petshop, loja ou oficina dentro do core

## Regras de implementacao

- usar modulos por dominio
- DTOs com validacao por `class-validator`
- auditoria em toda mutacao
- soft delete nos dados de negocio
- endpoints de importacao com idempotencia
- logs suficientes para rastrear integracoes

## Regras de nomenclatura

- nomes de entidades devem ser financeiros e genericos
- evitar nomes como `studentInvoice`, `petBill`, `workshopCharge`
- preferir nomes como `receivableTitle`, `receivableInstallment`, `financialParty`

## Regra de migracao

- toda migracao futura da escola para o financeiro deve ocorrer por API ou script de importacao controlado
- nao compartilhar tabelas fisicas entre produtos
