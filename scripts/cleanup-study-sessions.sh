#!/bin/bash
# One-time cleanup: delete all StudySession records
# Run on the server: bash ~/docker/study-app/scripts/cleanup-study-sessions.sh

set -e

echo "Current StudySession count:"
docker exec study-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" study_app_db -e "SELECT COUNT(*) AS count FROM StudySession;"

echo ""
read -p "Delete ALL StudySession records? (y/N) " confirm
if [ "$confirm" != "y" ]; then
  echo "Cancelled."
  exit 0
fi

docker exec study-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" study_app_db -e "DELETE FROM StudySession;"

echo "Done. StudySession count after cleanup:"
docker exec study-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" study_app_db -e "SELECT COUNT(*) AS count FROM StudySession;"
