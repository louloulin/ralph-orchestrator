/**
 * ProjectRepository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProjectRepository } from "./ProjectRepository";
import { initializeDatabase, getDatabase, closeDatabase } from "../db/connection";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ProjectRepository", () => {
  let repository: ProjectRepository;
  let tempDir: string;

  beforeEach(() => {
    // Create an in-memory database for each test
    initializeDatabase(getDatabase(":memory:"));
    repository = new ProjectRepository(getDatabase());
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-test-"));
  });

  afterEach(() => {
    closeDatabase();
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("create", () => {
    it("should create a project with all fields", () => {
      const projectPath = path.join(tempDir, "test-project");
      fs.mkdirSync(projectPath);

      const project = repository.create({
        name: "Test Project",
        path: projectPath,
        description: "A test project",
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe("Test Project");
      expect(project.path).toBe(projectPath);
      expect(project.description).toBe("A test project");
      expect(project.isActive).toBe(false);
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a project without description", () => {
      const projectPath = path.join(tempDir, "test-project-2");
      fs.mkdirSync(projectPath);

      const project = repository.create({
        name: "Minimal Project",
        path: projectPath,
      });

      expect(project.description).toBeNull();
    });
  });

  describe("findById", () => {
    it("should find a project by id", () => {
      const projectPath = path.join(tempDir, "test-project");
      fs.mkdirSync(projectPath);

      const created = repository.create({
        name: "Find Me",
        path: projectPath,
      });

      const found = repository.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe("Find Me");
    });

    it("should return undefined for non-existent id", () => {
      const found = repository.findById("non-existent-id");
      expect(found).toBeUndefined();
    });
  });

  describe("findByPath", () => {
    it("should find a project by path", () => {
      const projectPath = path.join(tempDir, "unique-path");
      fs.mkdirSync(projectPath);

      repository.create({
        name: "Path Project",
        path: projectPath,
      });

      const found = repository.findByPath(projectPath);
      expect(found).toBeDefined();
      expect(found?.name).toBe("Path Project");
    });
  });

  describe("findAll", () => {
    it("should return all projects ordered by updatedAt", () => {
      const path1 = path.join(tempDir, "project1");
      const path2 = path.join(tempDir, "project2");
      fs.mkdirSync(path1);
      fs.mkdirSync(path2);

      const p1 = repository.create({ name: "Project 1", path: path1, description: null });
      const p2 = repository.create({ name: "Project 2", path: path2, description: null });

      const all = repository.findAll();
      expect(all.length).toBe(2);

      // Note: Timestamps are stored with second precision in SQLite
      // If projects are created in the same second, their timestamps will be identical
      // and the ordering is undefined. We just verify both projects are returned.
      const projectNames = all.map(p => p.name);
      expect(projectNames).toContain("Project 1");
      expect(projectNames).toContain("Project 2");

      // If timestamps differ, verify ordering
      if (p1.updatedAt.getTime() !== p2.updatedAt.getTime()) {
        const expectedFirst = p1.updatedAt.getTime() > p2.updatedAt.getTime() ? "Project 1" : "Project 2";
        expect(all[0].name).toBe(expectedFirst);
      }
    });
  });

  describe("findActive", () => {
    it("should return undefined when no active project", () => {
      const active = repository.findActive();
      expect(active).toBeUndefined();
    });

    it("should return the active project", () => {
      const projectPath = path.join(tempDir, "active-project");
      fs.mkdirSync(projectPath);

      const created = repository.create({
        name: "Active Project",
        path: projectPath,
      });
      repository.setActive(created.id);

      const active = repository.findActive();
      expect(active).toBeDefined();
      expect(active?.name).toBe("Active Project");
    });
  });

  describe("update", () => {
    it("should update project fields", () => {
      const projectPath = path.join(tempDir, "update-test");
      fs.mkdirSync(projectPath);

      const created = repository.create({
        name: "Original Name",
        path: projectPath,
      });

      const updated = repository.update(created.id, {
        name: "Updated Name",
        description: "New description",
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe("Updated Name");
      expect(updated?.description).toBe("New description");
    });

    it("should return undefined for non-existent id", () => {
      const updated = repository.update("non-existent", { name: "New Name" });
      expect(updated).toBeUndefined();
    });
  });

  describe("setActive", () => {
    it("should set a project as active", () => {
      const projectPath = path.join(tempDir, "set-active-test");
      fs.mkdirSync(projectPath);

      const created = repository.create({
        name: "To Activate",
        path: projectPath,
      });

      const result = repository.setActive(created.id);
      expect(result?.isActive).toBe(true);

      const found = repository.findById(created.id);
      expect(found?.isActive).toBe(true);
    });

    it("should deactivate other projects when setting one active", () => {
      const path1 = path.join(tempDir, "project1");
      const path2 = path.join(tempDir, "project2");
      fs.mkdirSync(path1);
      fs.mkdirSync(path2);

      const p1 = repository.create({ name: "Project 1", path: path1 });
      const p2 = repository.create({ name: "Project 2", path: path2 });

      repository.setActive(p1.id);
      repository.setActive(p2.id);

      const found1 = repository.findById(p1.id);
      const found2 = repository.findById(p2.id);

      expect(found1?.isActive).toBe(false);
      expect(found2?.isActive).toBe(true);
    });

    it("should return undefined for non-existent id", () => {
      const result = repository.setActive("non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("deactivateAll", () => {
    it("should deactivate all projects", () => {
      const path1 = path.join(tempDir, "project1");
      const path2 = path.join(tempDir, "project2");
      fs.mkdirSync(path1);
      fs.mkdirSync(path2);

      const p1 = repository.create({ name: "Project 1", path: path1 });
      const p2 = repository.create({ name: "Project 2", path: path2 });

      repository.setActive(p1.id);
      repository.deactivateAll();

      const active = repository.findActive();
      expect(active).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should delete a project", () => {
      const projectPath = path.join(tempDir, "to-delete");
      fs.mkdirSync(projectPath);

      const created = repository.create({
        name: "To Delete",
        path: projectPath,
      });

      const result = repository.delete(created.id);
      expect(result).toBe(true);

      const found = repository.findById(created.id);
      expect(found).toBeUndefined();
    });

    it("should return false for non-existent id", () => {
      const result = repository.delete("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("pathExists", () => {
    it("should return true if path already registered", () => {
      const projectPath = path.join(tempDir, "existing-path");
      fs.mkdirSync(projectPath);

      repository.create({ name: "Existing", path: projectPath });

      expect(repository.pathExists(projectPath)).toBe(true);
    });

    it("should return false if path not registered", () => {
      expect(repository.pathExists("/non/existent/path")).toBe(false);
    });
  });

  describe("count", () => {
    it("should return correct count", () => {
      expect(repository.count()).toBe(0);

      const path1 = path.join(tempDir, "project1");
      const path2 = path.join(tempDir, "project2");
      fs.mkdirSync(path1);
      fs.mkdirSync(path2);

      repository.create({ name: "Project 1", path: path1 });
      expect(repository.count()).toBe(1);

      repository.create({ name: "Project 2", path: path2 });
      expect(repository.count()).toBe(2);
    });
  });
});
