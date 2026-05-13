import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderPlus,
  LockKeyhole,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createCatalogReferenceCategory,
  createCatalogReferenceValue,
  deleteCatalogReferenceCategory,
  deleteCatalogReferenceValue,
  getCatalogSnapshot,
  updateCatalogReferenceCategory,
  updateCatalogReferenceValue,
  type CatalogReferenceCategory,
  type CatalogReferenceValue,
} from "../api/adminApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageCatalog } from "../../../shared/auth/permissions";
import { Badge } from "../../../shared/ui/badge/Badge";
import { Button } from "../../../shared/ui/button/Button";
import { ConfirmationDialog } from "../../../shared/ui/confirmation-dialog/ConfirmationDialog";
import { EmptyState } from "../../../shared/ui/empty-state/EmptyState";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

function normalizeCategoryCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatChoiceCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${pluralize(count, singular, plural)}`;
}

export function CatalogAdminPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = canManageCatalog(user);
  const catalog = useQuery({
    queryFn: getCatalogSnapshot,
    queryKey: ["catalog-snapshot"],
  });
  const [newValue, setNewValue] = useState({ categoryCode: "", label: "" });
  const [newCategory, setNewCategory] = useState({ code: "", name: "" });
  const [editCategory, setEditCategory] = useState({
    isActive: true,
    name: "",
  });
  const [selectedReferenceValueId, setSelectedReferenceValueId] = useState("");
  const [referenceValueToDelete, setReferenceValueToDelete] =
    useState<CatalogReferenceValue | null>(null);
  const [categoryToDelete, setCategoryToDelete] =
    useState<CatalogReferenceCategory | null>(null);
  const [categoryToEdit, setCategoryToEdit] =
    useState<CatalogReferenceCategory | null>(null);
  const [isEditValueOpen, setIsEditValueOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [editReferenceValue, setEditReferenceValue] = useState({
    isActive: true,
    label: "",
  });

  const categoryOptions = useMemo(
    () =>
      [...(catalog.data?.referenceCategories ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [catalog.data?.referenceCategories],
  );

  const activeCategoryOptions = useMemo(
    () => categoryOptions.filter((category) => category.isActive),
    [categoryOptions],
  );

  const selectedReferenceValue = useMemo(
    () =>
      (catalog.data?.referenceValues ?? []).find(
        (value) => value.id === selectedReferenceValueId,
      ) ?? null,
    [catalog.data?.referenceValues, selectedReferenceValueId],
  );

  const groupedValues = useMemo(
    () =>
      categoryOptions.map((category) => ({
        category,
        values: (catalog.data?.referenceValues ?? []).filter(
          (value) => value.categoryCode === category.code,
        ),
      })),
    [catalog.data?.referenceValues, categoryOptions],
  );

  const choiceListSummary = useMemo(() => {
    const categories = catalog.data?.referenceCategories ?? [];
    const values = catalog.data?.referenceValues ?? [];

    return {
      tenderMappings: categories.reduce(
        (total, category) => total + category.usageCount,
        0,
      ),
      tenantCategories: categories.filter(
        (category) => !category.isSystemCategory,
      ).length,
      totalCategories: categories.length,
      values: values.length,
    };
  }, [catalog.data?.referenceCategories, catalog.data?.referenceValues]);

  useEffect(() => {
    const firstActiveCategory = activeCategoryOptions[0];
    if (!newValue.categoryCode && firstActiveCategory) {
      setNewValue((value) => ({
        ...value,
        categoryCode: firstActiveCategory.code,
      }));
    }
  }, [activeCategoryOptions, newValue.categoryCode]);

  useEffect(() => {
    if (selectedReferenceValue) {
      setEditReferenceValue({
        isActive: selectedReferenceValue.isActive,
        label: selectedReferenceValue.label,
      });
    }
  }, [selectedReferenceValue]);

  useEffect(() => {
    if (categoryToEdit) {
      setEditCategory({
        isActive: categoryToEdit.isActive,
        name: categoryToEdit.name,
      });
    }
  }, [categoryToEdit]);

  const createCategoryMutation = useMutation({
    mutationFn: () => createCatalogReferenceCategory(newCategory),
    onSuccess: async (result) => {
      setNewCategory({ code: "", name: "" });
      setIsCategoryOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Choice category created.", tone: "success" });
      if (result.id) {
        const createdCode = newCategory.code;
        setNewValue((value) => ({ ...value, categoryCode: createdCode }));
      }
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: () =>
      updateCatalogReferenceCategory(categoryToEdit?.id ?? "", editCategory),
    onSuccess: async () => {
      setCategoryToEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Choice category saved.", tone: "success" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: () =>
      deleteCatalogReferenceCategory(categoryToDelete?.id ?? ""),
    onSuccess: async () => {
      setCategoryToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Choice category deleted.", tone: "success" });
    },
  });

  const createValueMutation = useMutation({
    mutationFn: () => createCatalogReferenceValue(newValue),
    onSuccess: async (result) => {
      setNewValue((value) => ({ ...value, label: "" }));
      setSelectedReferenceValueId(result.id);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Choice value created.", tone: "success" });
    },
  });

  const updateValueMutation = useMutation({
    mutationFn: () =>
      updateCatalogReferenceValue(selectedReferenceValueId, editReferenceValue),
    onSuccess: async () => {
      setIsEditValueOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Choice value saved.", tone: "success" });
    },
  });

  const deleteValueMutation = useMutation({
    mutationFn: () =>
      deleteCatalogReferenceValue(referenceValueToDelete?.id ?? ""),
    onSuccess: async () => {
      setReferenceValueToDelete(null);
      setSelectedReferenceValueId("");
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Choice value deleted.", tone: "success" });
    },
  });

  const onCreateCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    createCategoryMutation.mutate();
  };

  const onUpdateCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    updateCategoryMutation.mutate();
  };

  const onCreateValue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    createValueMutation.mutate();
  };

  const onUpdateValue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    updateValueMutation.mutate();
  };

  const openValueEdit = (value: CatalogReferenceValue) => {
    setSelectedReferenceValueId(value.id);
    setEditReferenceValue({
      isActive: value.isActive,
      label: value.label,
    });
    setIsEditValueOpen(true);
  };

  const openCategoryEdit = (category: CatalogReferenceCategory) => {
    setCategoryToEdit(category);
    setEditCategory({
      isActive: category.isActive,
      name: category.name,
    });
  };

  const deleteCategoryDescription = categoryToDelete
    ? categoryToDelete.usageCount > 0
      ? `${categoryToDelete.name} is used by ${formatChoiceCount(
          categoryToDelete.usageCount,
          "tender",
        )} and cannot be deleted.`
      : `Delete ${categoryToDelete.name}? ${formatChoiceCount(
          categoryToDelete.valueCount,
          "value",
        )} in this category will also be removed.`
    : "Delete this choice category?";

  return (
    <section className="admin-section">
      <PageHeader eyebrow="Admin" title="Choice Lists">
        Manage dropdown categories and values used across procurement forms.
      </PageHeader>

      <div className="admin-stack">
        <section className="state-panel choice-list-guidance">
          <div>
            <p className="eyebrow">How this works</p>
            <h2>
              Categories organize dropdowns. Values are the options users
              select.
            </h2>
            <p>
              System categories cannot be renamed because forms and reports
              depend on them. Any category can be removed when none of its
              values are mapped to tenders.
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setIsCategoryOpen(true)}>
              <FolderPlus size={18} />
              New Category
            </Button>
          ) : null}
        </section>

        {catalog.data ? (
          <section
            className="choice-list-summary-grid"
            aria-label="Choice list summary"
          >
            <div className="choice-list-summary-item">
              <span>Categories</span>
              <strong>{choiceListSummary.totalCategories}</strong>
            </div>
            <div className="choice-list-summary-item">
              <span>Tenant Categories</span>
              <strong>{choiceListSummary.tenantCategories}</strong>
            </div>
            <div className="choice-list-summary-item">
              <span>Values</span>
              <strong>{choiceListSummary.values}</strong>
            </div>
            <div className="choice-list-summary-item">
              <span>Tender Mappings</span>
              <strong>{choiceListSummary.tenderMappings}</strong>
            </div>
          </section>
        ) : null}

        {canManage ? (
          <section className="state-panel">
            <div className="detail-header">
              <div>
                <p className="eyebrow">Create</p>
                <h2>Add Choice Value</h2>
              </div>
              <Tags size={20} />
            </div>
            <form className="choice-list-add-grid" onSubmit={onCreateValue}>
              <FormField label="Category">
                <select
                  className="text-input"
                  disabled={activeCategoryOptions.length === 0}
                  onChange={(event) =>
                    setNewValue((value) => ({
                      ...value,
                      categoryCode: event.target.value,
                    }))
                  }
                  required
                  value={newValue.categoryCode}
                >
                  {activeCategoryOptions.map((category) => (
                    <option key={category.id} value={category.code}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Value">
                <TextInput
                  maxLength={200}
                  onChange={(event) =>
                    setNewValue((value) => ({
                      ...value,
                      label: event.target.value,
                    }))
                  }
                  placeholder="Enter value text"
                  required
                  value={newValue.label}
                />
              </FormField>
              <Button
                disabled={
                  createValueMutation.isPending ||
                  activeCategoryOptions.length === 0 ||
                  !newValue.categoryCode
                }
                type="submit"
              >
                <Plus size={18} />
                Add Value
              </Button>
            </form>
            {createValueMutation.error ? (
              <p className="inline-error">
                {createValueMutation.error.message}
              </p>
            ) : null}
          </section>
        ) : null}

        {catalog.isLoading ? (
          <section className="state-panel">
            <Skeleton height={20} />
          </section>
        ) : catalog.error ? (
          <section className="state-panel state-panel-error">
            <p className="inline-error">{catalog.error.message}</p>
          </section>
        ) : groupedValues.length === 0 ? (
          <section className="state-panel">
            <EmptyState title="No choice categories yet">
              <Tags size={18} />
            </EmptyState>
          </section>
        ) : (
          <div className="choice-list-card-grid">
            {groupedValues.map(({ category, values }) => {
              const categoryUsageCount = category.usageCount;
              const canDeleteCategory = categoryUsageCount === 0;

              return (
                <section className="choice-list-card" key={category.id}>
                  <div className="choice-list-card-header">
                    <div>
                      <p className="eyebrow">Category</p>
                      <h2>{category.name}</h2>
                      <span className="choice-list-category-code">
                        {category.code}
                      </span>
                    </div>
                    <div className="choice-list-card-actions">
                      <Badge
                        tone={category.isSystemCategory ? "info" : "neutral"}
                      >
                        {category.isSystemCategory ? "System" : "Tenant"}
                      </Badge>
                      <StatusBadge
                        tone={category.isActive ? "success" : "neutral"}
                      >
                        {category.isActive ? "Active" : "Inactive"}
                      </StatusBadge>
                      {canManage ? (
                        <div className="row-actions">
                          {!category.isSystemCategory ? (
                            <IconButton
                              aria-label={`Edit ${category.name}`}
                              onClick={() => openCategoryEdit(category)}
                              tooltip="Edit category"
                            >
                              <Pencil size={17} />
                            </IconButton>
                          ) : null}
                          <IconButton
                            aria-label={`Delete ${category.name}`}
                            disabled={!canDeleteCategory}
                            onClick={() => setCategoryToDelete(category)}
                            tooltip={
                              canDeleteCategory
                                ? "Delete category and unused values"
                                : "Category is used by tenders and cannot be deleted"
                            }
                            variant="danger"
                          >
                            <Trash2 size={17} />
                          </IconButton>
                        </div>
                      ) : category.isSystemCategory ? (
                        <LockKeyhole className="choice-list-lock" size={17} />
                      ) : null}
                    </div>
                  </div>
                  <div className="choice-list-card-stats">
                    <span className="choice-list-stat-pill">
                      <strong>{category.valueCount}</strong>
                      {pluralize(category.valueCount, "value")}
                    </span>
                    <span
                      className={`choice-list-stat-pill ${
                        categoryUsageCount > 0
                          ? "choice-list-stat-pill-warning"
                          : ""
                      }`}
                    >
                      <strong>{categoryUsageCount}</strong>
                      {pluralize(categoryUsageCount, "tender")} mapped
                    </span>
                    {canManage ? (
                      <span
                        className={`choice-list-delete-note ${
                          canDeleteCategory ? "is-ready" : "is-blocked"
                        }`}
                      >
                        {canDeleteCategory
                          ? "Delete available"
                          : "Tender usage blocks delete"}
                      </span>
                    ) : null}
                  </div>
                  {values.length > 0 ? (
                    <div className="choice-list-row-list">
                      {values.map((value) => (
                        <div className="choice-list-row" key={value.id}>
                          <div className="choice-list-value-copy">
                            <strong>{value.label}</strong>
                            <span>
                              {formatChoiceCount(value.usageCount, "tender")}
                            </span>
                          </div>
                          <div className="choice-list-row-meta">
                            <StatusBadge
                              tone={value.isActive ? "success" : "neutral"}
                            >
                              {value.isActive ? "Active" : "Inactive"}
                            </StatusBadge>
                            {canManage ? (
                              <div className="row-actions">
                                <IconButton
                                  aria-label={`Edit ${value.label}`}
                                  onClick={() => openValueEdit(value)}
                                  tooltip="Edit value"
                                >
                                  <Pencil size={17} />
                                </IconButton>
                                <IconButton
                                  aria-label={`Delete ${value.label}`}
                                  disabled={value.usageCount > 0}
                                  onClick={() =>
                                    setReferenceValueToDelete(value)
                                  }
                                  tooltip={
                                    value.usageCount > 0
                                      ? "Value is used by tenders and cannot be deleted"
                                      : "Delete value"
                                  }
                                  variant="danger"
                                >
                                  <Trash2 size={17} />
                                </IconButton>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No values yet">
                      <Tags size={18} />
                    </EmptyState>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <Modal
          isOpen={isCategoryOpen}
          onClose={() => setIsCategoryOpen(false)}
          title="New Choice Category"
        >
          <form className="stack-form" onSubmit={onCreateCategory}>
            <FormField label="Category Name">
              <TextInput
                maxLength={160}
                onChange={(event) => {
                  const name = event.target.value;
                  setNewCategory((value) => ({
                    code: value.code ? value.code : normalizeCategoryCode(name),
                    name,
                  }));
                }}
                placeholder="Example: Approval Route"
                required
                value={newCategory.name}
              />
            </FormField>
            <FormField label="Category Code">
              <TextInput
                maxLength={80}
                onChange={(event) =>
                  setNewCategory((value) => ({
                    ...value,
                    code: normalizeCategoryCode(event.target.value),
                  }))
                }
                placeholder="approval_route"
                required
                value={newCategory.code}
              />
              <p className="field-hint">
                Use lowercase letters, numbers, and underscores.
              </p>
            </FormField>
            <div className="modal-actions">
              <Button
                variant="ghost"
                onClick={() => setIsCategoryOpen(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button disabled={createCategoryMutation.isPending} type="submit">
                Create Category
              </Button>
            </div>
          </form>
          {createCategoryMutation.error ? (
            <p className="inline-error">
              {createCategoryMutation.error.message}
            </p>
          ) : null}
        </Modal>

        <Modal
          isOpen={Boolean(categoryToEdit)}
          onClose={() => setCategoryToEdit(null)}
          title={
            categoryToEdit
              ? `Edit ${categoryToEdit.name}`
              : "Edit Choice Category"
          }
        >
          <form className="stack-form" onSubmit={onUpdateCategory}>
            <FormField label="Category Name">
              <TextInput
                disabled={!categoryToEdit}
                maxLength={160}
                onChange={(event) =>
                  setEditCategory((value) => ({
                    ...value,
                    name: event.target.value,
                  }))
                }
                required
                value={editCategory.name}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={editCategory.isActive}
                disabled={!categoryToEdit}
                onChange={(event) =>
                  setEditCategory((value) => ({
                    ...value,
                    isActive: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Active
            </label>
            <div className="modal-actions">
              <Button
                variant="ghost"
                onClick={() => setCategoryToEdit(null)}
                type="button"
              >
                Cancel
              </Button>
              <Button
                disabled={!categoryToEdit || updateCategoryMutation.isPending}
                type="submit"
              >
                Save Category
              </Button>
            </div>
          </form>
          {updateCategoryMutation.error ? (
            <p className="inline-error">
              {updateCategoryMutation.error.message}
            </p>
          ) : null}
        </Modal>

        <Modal
          isOpen={isEditValueOpen}
          onClose={() => setIsEditValueOpen(false)}
          title={
            selectedReferenceValue
              ? selectedReferenceValue.label
              : "Edit Choice Value"
          }
        >
          <form className="stack-form" onSubmit={onUpdateValue}>
            <FormField label="Label">
              <TextInput
                disabled={!selectedReferenceValue}
                maxLength={200}
                onChange={(event) =>
                  setEditReferenceValue((value) => ({
                    ...value,
                    label: event.target.value,
                  }))
                }
                required
                value={editReferenceValue.label}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={editReferenceValue.isActive}
                disabled={!selectedReferenceValue}
                onChange={(event) =>
                  setEditReferenceValue((value) => ({
                    ...value,
                    isActive: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Active
            </label>
            <div className="modal-actions">
              <Button
                variant="ghost"
                onClick={() => setIsEditValueOpen(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !selectedReferenceValue || updateValueMutation.isPending
                }
                type="submit"
              >
                Save Value
              </Button>
            </div>
          </form>
          {updateValueMutation.error ? (
            <p className="inline-error">{updateValueMutation.error.message}</p>
          ) : null}
        </Modal>

        <ConfirmationDialog
          confirmLabel="Delete Category"
          description={deleteCategoryDescription}
          isPending={deleteCategoryMutation.isPending}
          isOpen={Boolean(categoryToDelete)}
          onCancel={() => setCategoryToDelete(null)}
          onConfirm={() => deleteCategoryMutation.mutate()}
          title="Delete Choice Category"
          tone="danger"
        >
          {deleteCategoryMutation.error ? (
            <p className="inline-error">
              {deleteCategoryMutation.error.message}
            </p>
          ) : null}
        </ConfirmationDialog>

        <ConfirmationDialog
          confirmLabel="Delete Value"
          description={
            referenceValueToDelete
              ? `Delete ${referenceValueToDelete.label}? It will be removed from future form choices.`
              : "Delete this choice value?"
          }
          isPending={deleteValueMutation.isPending}
          isOpen={Boolean(referenceValueToDelete)}
          onCancel={() => setReferenceValueToDelete(null)}
          onConfirm={() => deleteValueMutation.mutate()}
          title="Delete Choice Value"
          tone="danger"
        >
          {deleteValueMutation.error ? (
            <p className="inline-error">{deleteValueMutation.error.message}</p>
          ) : null}
        </ConfirmationDialog>
      </div>
    </section>
  );
}
