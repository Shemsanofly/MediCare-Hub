import type { Category } from '@/types';

interface CategoryTreeProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
}

interface CategoryNodeProps {
  category: Category;
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
  depth?: number;
}

const CategoryNode = ({
  category,
  selectedId,
  onSelect,
  depth = 0,
}: CategoryNodeProps) => {
  const hasChildren = category.children && category.children.length > 0;
  const isSelected = selectedId === category.id;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(category.id)}
        className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition ${
          isSelected
            ? 'bg-primary-50 font-medium text-primary'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {category.name}
      </button>
      {hasChildren && (
        <ul className="mt-0.5">
          {category.children!.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

/** Recursive expandable category tree for catalog filters. */
const CategoryTree = ({ categories, selectedId, onSelect }: CategoryTreeProps) => (
  <div>
    <button
      type="button"
      onClick={() => onSelect(null)}
      className={`mb-2 w-full rounded-md px-2 py-1.5 text-left text-sm ${
        selectedId === null
          ? 'bg-primary-50 font-medium text-primary'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      All categories
    </button>
    <ul className="space-y-0.5">
      {categories.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  </div>
);

export default CategoryTree;
