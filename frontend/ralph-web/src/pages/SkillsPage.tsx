/**
 * Skills Page
 *
 * Skill management and marketplace UI.
 */

import * as React from "react";
import { useState } from "react";
import { BookOpen, Search, Filter, Tag, User, ToggleLeft, ToggleRight } from "lucide-react";
import { trpc } from "@/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SkillEntry,
  SkillSource,
  SKILL_SOURCE_LABELS,
  SKILL_SOURCE_COLORS,
} from "@/types/skill";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";

/**
 * SkillCard component
 */
function SkillCard({
  skill,
  onClick,
}: {
  skill: SkillEntry;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{skill.name}</CardTitle>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              SKILL_SOURCE_COLORS[skill.source]
            )}
          >
            {SKILL_SOURCE_LABELS[skill.source]}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {skill.description}
        </p>
        <div className="flex flex-wrap gap-1 mt-3">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {skill.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{skill.tags.length - 3}
            </Badge>
          )}
        </div>
        {skill.author && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <User className="w-3 h-3" />
            {skill.author}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * SkillDetailPanel component
 */
function SkillDetailPanel({
  skillName,
  onClose,
}: {
  skillName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: skill, isLoading } = trpc.skills.get.useQuery({ name: skillName });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("common.loading", "Loading...")}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!skill) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("common.notFound", "Not Found")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Skill not found</p>
          <Button onClick={onClose} className="mt-4">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{skill.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ×
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              SKILL_SOURCE_COLORS[skill.source]
            )}
          >
            {SKILL_SOURCE_LABELS[skill.source]}
          </span>
          {skill.version && (
            <span className="text-xs text-muted-foreground">v{skill.version}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{skill.description}</p>

        <div className="flex flex-wrap gap-1">
          {skill.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              <Tag className="w-3 h-3 mr-1" />
              {tag}
            </Badge>
          ))}
        </div>

        <div className="border rounded-md p-4 bg-muted/30">
          <pre className="text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {skill.content}
          </pre>
        </div>

        {skill.author && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            {skill.author}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * SkillsPage main component
 */
export function SkillsPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<SkillSource | "all">("all");
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const { data: skills, isLoading } = trpc.skills.list.useQuery({
    source: selectedSource === "all" ? undefined : selectedSource,
  });

  const filteredSkills = skills?.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Skills
        </h1>
        <p className="text-muted-foreground">
          Browse and manage Ralph skills
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={selectedSource === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedSource("all")}
          >
            All
          </Button>
          <Button
            variant={selectedSource === "built_in" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedSource("built_in")}
          >
            Built-in
          </Button>
          <Button
            variant={selectedSource === "user_defined" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedSource("user_defined")}
          >
            User
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Skills List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t("skills.available", "Available Skills")}
            {filteredSkills && ` (${filteredSkills.length})`}
          </h2>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("common.loading", "Loading...")}
            </div>
          ) : filteredSkills?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No skills found
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredSkills?.map((skill) => (
                <SkillCard
                  key={skill.name}
                  skill={skill}
                  onClick={() => setSelectedSkill(skill.name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Skill Detail */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t("skills.details", "Skill Details")}
          </h2>
          {selectedSkill ? (
            <SkillDetailPanel
              skillName={selectedSkill}
              onClose={() => setSelectedSkill(null)}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Select a skill to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default SkillsPage;
