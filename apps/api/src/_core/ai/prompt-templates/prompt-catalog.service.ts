import { Injectable, NotFoundException } from '@nestjs/common';
import type { PromptTemplate } from './prompt-template.interface';
import { smokeHelloTemplate } from './catalog/smoke-hello.template';
import { relanceLocataireTemplate } from './catalog/relance-locataire.template';

const CATALOG: Map<string, PromptTemplate> = new Map(
  [smokeHelloTemplate, relanceLocataireTemplate].map((t) => [t.id, t]),
);

@Injectable()
export class PromptCatalogService {
  get(id: string): PromptTemplate {
    const tpl = CATALOG.get(id);
    if (!tpl) throw new NotFoundException(`Prompt template inconnu : "${id}"`);
    return tpl;
  }

  list(): PromptTemplate[] {
    return [...CATALOG.values()];
  }
}
