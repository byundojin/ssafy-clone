import * as vscode from "vscode";
import { Course, Chapter, Assignment } from "../types";

// ── TreeItem 타입들 ──────────────────────────────────────────────

export class CourseItem extends vscode.TreeItem {
  constructor(public readonly course: Course) {
    super(course.name, vscode.TreeItemCollapsibleState.Collapsed);
    const totalAssignments = course.chapters.reduce((s, c) => s + c.assignments.length, 0);
    this.description = `목차 ${course.chapters.length} · 과제 ${totalAssignments}`;
    this.iconPath = new vscode.ThemeIcon("book");
    this.contextValue = "course";
  }
}

export class ChapterItem extends vscode.TreeItem {
  constructor(
    public readonly course: Course,
    public readonly chapter: Chapter
  ) {
    super(chapter.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${chapter.assignments.length}개`;
    this.iconPath = new vscode.ThemeIcon("list-tree");
    this.contextValue = "chapter";
  }
}

export class AssignmentItem extends vscode.TreeItem {
  constructor(
    public readonly course: Course,
    public readonly chapter: Chapter,
    public readonly assignment: Assignment
  ) {
    super(assignment.name, vscode.TreeItemCollapsibleState.None);
    this.description = assignment.type;
    this.iconPath = new vscode.ThemeIcon(
      assignment.type === "실습" ? "beaker" : "tasklist"
    );
    this.contextValue = "assignment";
    this.tooltip = `[${assignment.type}] ${assignment.name}\n${chapter.name}`;
  }
}

type TreeNode = CourseItem | ChapterItem | AssignmentItem;

// ── Provider ─────────────────────────────────────────────────────

export class CourseTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private courses: Course[] = [];

  refresh(courses: Course[]) {
    this.courses = courses;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      if (this.courses.length === 0) return [];
      return this.courses.map((c) => new CourseItem(c));
    }
    if (element instanceof CourseItem) {
      return element.course.chapters.map((ch) => new ChapterItem(element.course, ch));
    }
    if (element instanceof ChapterItem) {
      return element.chapter.assignments.map(
        (a) => new AssignmentItem(element.course, element.chapter, a)
      );
    }
    return [];
  }
}
