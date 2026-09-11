import { TodosRoute } from "../../../src/features/todos/todos.route";
import { useOrganization } from "../../../src/hooks/use-organization";

export default function TodosScreen() {
  const { activeOrganizationId } = useOrganization();
  return <TodosRoute key={activeOrganizationId} />;
}
